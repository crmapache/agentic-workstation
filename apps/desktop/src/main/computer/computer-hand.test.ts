import { it, expect, describe } from 'vitest'

import type { Motion } from '../browser/human-motion'
import { ComputerError } from './computer-error'
import { pieces, ComputerHand } from './computer-hand'
import { parseChord, WINDOWS_KEYMAP } from './computer-keys'
import type { Point, InputDriver, TextClipboard } from './computer.types'

const AREA = { x: 0, y: 0, width: 1000, height: 800 }

/** Мгновенное время с ровной случайностью: шаги идут все, паузы не ждут. */
const instant = (onSleep: () => void = () => undefined): Motion => ({
  random: () => 0.5,
  now: () => 0,
  sleep: () => {
    onSleep()

    return Promise.resolve()
  },
})

/** Ввод, который записывает события и двигает свой курсор, как система. */
const fakeInput = (start: Point = { x: 10, y: 10 }) => {
  const events: string[] = []
  const state = { at: { ...start }, flags: 0, button: false }
  const input: InputDriver = {
    cursor: () => ({ ...state.at }),
    mouse: (motion, at, button, clicks) => {
      state.at = { ...at }
      if (motion !== 'move' && motion !== 'drag') events.push(`${motion}:${button}:${clicks}`)
    },
    key: (code, isDown, flags) => events.push(`key${isDown ? '↓' : '↑'}:${code}:${flags}`),
    text: (chunk, phase) =>
      events.push(
        phase === 'tap' ? `text:${chunk}` : `text${phase === 'down' ? '↓' : '↑'}:${chunk}`,
      ),
    typing: { chunk: 20, holdMs: 0, gapMs: 8 },
    scroll: (down, right) => events.push(`scroll:${down}:${right}`),
    heldFlags: () => state.flags,
    isButtonHeld: () => state.button,
  }

  return { input, events, state }
}

/** Буфер для вставок: пишет, что с ним делали; taken - взяло ли приложение текст. */
const fakePaste = (taken = true, canSave = true) => {
  const log: string[] = []
  const clipboard: TextClipboard = {
    open: () => {
      log.push('open')

      return Promise.resolve(
        canSave
          ? {
              offer: (text) => {
                log.push(`offer:${text}`)

                return Promise.resolve(true)
              },
              taken: () => {
                log.push('taken')

                return Promise.resolve(taken)
              },
              close: () => {
                log.push('close')

                return Promise.resolve()
              },
            }
          : null,
      )
    },
  }

  return { clipboard, log }
}

const signal = () => new AbortController().signal

describe('computer hand', () => {
  it('walks the cursor to the point and presses and releases the button', async () => {
    const { input, events, state } = fakeInput()
    const hand = new ComputerHand(input, instant())

    await hand.click(
      { x: 500, y: 400 },
      AREA,
      { button: 'left', count: 2, modifiers: [] },
      signal(),
    )

    expect(state.at).toEqual({ x: 500, y: 400 })
    expect(events).toEqual(['down:left:1', 'up:left:1', 'down:left:2', 'up:left:2'])
  })

  it('stops the moment the person moves the mouse away from the hand', async () => {
    const { input, state } = fakeInput()
    let sleeps = 0
    const hand = new ComputerHand(
      input,
      instant(() => {
        sleeps += 1
        // Посреди пути человек увёл мышь в сторону.
        if (sleeps === 4) state.at = { x: 900, y: 700 }
      }),
    )

    await expect(hand.moveTo({ x: 600, y: 300 }, AREA, signal())).rejects.toMatchObject({
      code: 'interrupted',
    })
  })

  it('keeps the arc inside the display, so the screen edge is not taken for the person', async () => {
    const { input, state } = fakeInput({ x: 5, y: 5 })
    const seen: Point[] = []
    const watched: InputDriver = {
      ...input,
      mouse: (...args) => {
        seen.push(args[1])
        input.mouse(...args)
      },
    }

    await new ComputerHand(watched, instant()).moveTo({ x: 999, y: 0 }, AREA, signal())

    expect(seen.every((point) => point.x >= 0 && point.x <= 999 && point.y >= 0)).toBe(true)
    expect(state.at).toEqual({ x: 999, y: 0 })
  })

  it('waits for the person to let go of a modifier before acting', async () => {
    const { input, state } = fakeInput()
    let sleeps = 0
    const now = { value: 0 }
    const hand = new ComputerHand(input, {
      random: () => 0.5,
      now: () => now.value,
      sleep: (ms) => {
        sleeps += 1
        now.value += Math.max(ms, 0)
        if (sleeps === 3) state.flags = 0

        return Promise.resolve()
      },
    })

    state.flags = 0x100000
    await hand.waitForStill(signal())

    expect(sleeps).toBeGreaterThan(3)
  })

  it('gives up waiting when the person keeps working', async () => {
    const { input, state } = fakeInput()
    const now = { value: 0 }
    const hand = new ComputerHand(input, {
      random: () => 0.5,
      now: () => now.value,
      sleep: (ms) => {
        now.value += Math.max(ms, 0)
        state.at = { x: state.at.x + 10, y: state.at.y }

        return Promise.resolve()
      },
    })

    state.button = true

    await expect(hand.waitForStill(signal())).rejects.toBeInstanceOf(ComputerError)
  })

  it('lets go of a drag where the pointer is when the user grabs the mouse halfway', async () => {
    const { input, state } = fakeInput()
    const ups: Point[] = []
    let isDown = false
    let sleepsAfterDown = 0
    const watched: InputDriver = {
      ...input,
      mouse: (motion, at, ...rest) => {
        if (motion === 'down') isDown = true
        if (motion === 'up') ups.push(at)

        input.mouse(motion, at, ...rest)
      },
    }
    const hand = new ComputerHand(
      watched,
      instant(() => {
        // Кнопка уже зажата, рука тянет - человек увёл мышь в сторону.
        if (isDown && (sleepsAfterDown += 1) === 3) state.at = { x: 900, y: 700 }
      }),
    )

    await expect(
      hand.drag({ x: 100, y: 100 }, { x: 600, y: 300 }, AREA, signal()),
    ).rejects.toMatchObject({ code: 'interrupted' })
    expect(ups).toEqual([{ x: 900, y: 700 }])
  })

  it('types short text key by key and presses Return for a new line', async () => {
    const { input, events } = fakeInput()

    await new ComputerHand(input, instant()).type('hi\nyo', signal())

    expect(events).toEqual(['text:h', 'text:i', 'key↓:36:0', 'key↑:36:0', 'text:y', 'text:o'])
  })

  it('presses the modifiers as keys around the chord and lets go of them in reverse', async () => {
    const { input, events } = fakeInput()

    await new ComputerHand(input, instant()).press(parseChord('cmd+shift+t'), 2, signal())

    const once = [
      'key↓:55:1048576',
      'key↓:56:1179648',
      'key↓:17:1179648',
      'key↑:17:1179648',
      'key↑:56:1048576',
      'key↑:55:0',
    ]

    expect(events).toEqual([...once, ...once])
  })

  it('lets go of the modifiers even when the action is cut short, so nothing stays held', async () => {
    const { input, events } = fakeInput()
    const cut = new AbortController()
    const hand = new ComputerHand(input, {
      ...instant(),
      sleep: (_ms, abort) => {
        cut.abort(new ComputerError('paused', 'paused'))

        return abort?.aborted ? Promise.reject(new Error('aborted')) : Promise.resolve()
      },
    })

    await expect(hand.press(parseChord('cmd+t'), 1, cut.signal)).rejects.toThrow()

    expect(events.at(-1)).toBe('key↑:55:0')
  })

  it('holds a modifier through a click and releases it after the button', async () => {
    const { input, events } = fakeInput()
    const modifiers = parseChord('cmd').modifiers

    await new ComputerHand(input, instant()).click(
      { x: 50, y: 50 },
      AREA,
      { button: 'left', count: 1, modifiers },
      signal(),
    )

    expect(events).toEqual(['key↓:55:1048576', 'down:left:1', 'up:left:1', 'key↑:55:0'])
  })

  it('stops typing the moment the user holds a modifier, so nothing lands in a new window', async () => {
    const { input, events, state } = fakeInput()
    let sleeps = 0
    const hand = new ComputerHand(
      input,
      instant(() => {
        sleeps += 1
        // После второго знака человек зажал ⌘ - сейчас будет ⌘Tab.
        if (sleeps === 2) state.flags = 0x100000
      }),
    )

    await expect(hand.type('hello', signal())).rejects.toMatchObject({ code: 'interrupted' })
    expect(events).toEqual(['text:h', 'text:e'])
  })

  it('sends nothing at all for a call that was already cancelled', async () => {
    const { input, events } = fakeInput()
    const cancel = new AbortController()

    cancel.abort()

    await expect(
      new ComputerHand(input, instant()).press(parseChord('return'), 1, cancel.signal),
    ).rejects.toMatchObject({ code: 'cancelled' })
    await expect(new ComputerHand(input, instant()).type('x', cancel.signal)).rejects.toMatchObject(
      { code: 'cancelled' },
    )
    expect(events).toEqual([])
  })

  it('does not touch a window that would drop the input, and says why', async () => {
    const { input, events } = fakeInput()
    const blocked: InputDriver = { ...input, canReach: () => false }
    const hand = new ComputerHand(blocked, instant())

    await expect(
      hand.click({ x: 50, y: 50 }, AREA, { button: 'left', count: 1, modifiers: [] }, signal()),
    ).rejects.toMatchObject({ code: 'blocked' })
    await expect(hand.type('hi', signal())).rejects.toMatchObject({ code: 'blocked' })
    expect(events).toEqual([])
  })

  it('presses Return from the keymap of the system it runs on', async () => {
    const { input, events } = fakeInput()

    await new ComputerHand(input, instant(), WINDOWS_KEYMAP).type('a\nb', signal())

    expect(events).toContain('key↓:13:0')
  })

  it('pastes text where the system has a clipboard, with Return between the lines', async () => {
    const { input, events } = fakeInput()
    const { clipboard, log } = fakePaste()

    await new ComputerHand({ ...input, clipboard }, instant(), WINDOWS_KEYMAP).type(
      'hello\nworld',
      signal(),
    )

    const paste = ['key↓:17:262144', 'key↓:86:262144', 'key↑:86:262144', 'key↑:17:0']

    expect(log).toEqual(['open', 'offer:hello', 'taken', 'offer:world', 'taken', 'close'])
    expect(events).toEqual([...paste, 'key↓:13:0', 'key↑:13:0', ...paste])
  })

  it('types by keys what the app would not take as a paste, and everything after it', async () => {
    const { input, events } = fakeInput()
    const { clipboard, log } = fakePaste(false)

    await new ComputerHand({ ...input, clipboard }, instant(), WINDOWS_KEYMAP).type(
      'ab\ncd',
      signal(),
    )

    expect(log).toEqual(['open', 'offer:ab', 'taken', 'close'])
    expect(events.filter((event) => event.startsWith('text'))).toEqual([
      'text:a',
      'text:b',
      'text:c',
      'text:d',
    ])
  })

  it('types by keys when the clipboard cannot be saved, and gives it back when cut short', async () => {
    const { input, events, state } = fakeInput()
    const unsaved = fakePaste(true, false)
    const saved = fakePaste()

    await new ComputerHand({ ...input, clipboard: unsaved.clipboard }, instant()).type(
      'hi',
      signal(),
    )

    expect(events).toEqual(['text:h', 'text:i'])

    state.flags = 0x100000

    await expect(
      new ComputerHand({ ...input, clipboard: saved.clipboard }, instant()).type('hi', signal()),
    ).rejects.toMatchObject({ code: 'interrupted' })
    expect(saved.log).toEqual(['open', 'close'])
  })

  it('holds every character on a system that drops characters sent back to back', async () => {
    const { input, events } = fakeInput()
    const windowsLike: InputDriver = { ...input, typing: { chunk: 1, holdMs: 30, gapMs: 30 } }
    const long = 'x'.repeat(81)

    await new ComputerHand(windowsLike, instant()).type(long, signal())

    expect(events.slice(0, 4)).toEqual(['text↓:x', 'text↑:x', 'text↓:x', 'text↑:x'])
    expect(events).toHaveLength(162)
  })

  it('cuts text into pieces that fit an event, keeping new lines and surrogate pairs whole', () => {
    expect(pieces('ab\ncd', 20)).toEqual(['ab', '\n', 'cd'])
    expect(pieces('abcde', 2)).toEqual(['ab', 'cd', 'e'])
    expect(pieces('a😀b', 2)).toEqual(['a', '😀', 'b'])
    expect(pieces('🎉 ok', 1)).toEqual(['🎉', ' ', 'o', 'k'])
    expect(pieces('a\n😀', 1)).toEqual(['a', '\n', '😀'])
  })
})
