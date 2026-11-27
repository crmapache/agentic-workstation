import { it, vi, expect, describe } from 'vitest'

import type { WalkthroughMark } from '@shared/walkthrough'

import type { Aim } from '../computer/computer-agent'
import { ComputerError } from '../computer/computer-error'
import type { Glance } from '../computer/computer-seen'
import type { Scene } from '../computer/screen-scene'
import { NOT_RUNNING, WalkthroughDesk, SPEECH_WAIT_MAX_MS } from './walkthrough-desk'
import type { WalkthroughCall } from './walkthrough-desk'

const DISPLAY = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1000, height: 800 },
  scaleFactor: 2,
  isMain: true,
}

const WINDOW: Scene = [
  { id: 7, isOrdinary: true, bounds: { x: 0, y: 0, width: 1000, height: 800 } },
]

/** Сколько ждать обещаний очереди меток: они идут цепочкой микрозадач. */
const settle = async () => {
  for (let step = 0; step < 10; step += 1) await Promise.resolve()
}

/**
 * Голос звонка, который скажет «дослушано» по команде теста. Обёртка звонка - новая на каждый
 * запрос, как у живого моста в ide-features: показ узнаёт звонок по id, а не по объекту.
 */
const voice = () => {
  const turns: Array<(spoken: boolean) => void> = []
  const end = vi.fn()
  const call = (): WalkthroughCall => ({
    id: 'call1',
    speechSoFar: () =>
      Promise.resolve({ spoken: new Promise<boolean>((resolve) => turns.push(resolve)) }),
    end,
  })

  return { call, end, turns, hear: (spoken = true) => turns.shift()?.(spoken) }
}

const harness = (options: { aim?: Aim; scene?: () => Scene } = {}) => {
  const line = voice()
  let scene = options.scene ?? (() => WINDOW)
  let inputAt: number | null = 0
  let quiet: number | null = 10_000
  const shown: WalkthroughMark[][] = []
  const timers: Array<{ run: () => void; ms: number }> = []
  const handOver = vi.fn()
  const glance = (): Glance => ({ inputAt, scene: scene() })
  const desk = new WalkthroughDesk({
    computer: {
      aim: () =>
        options.aim ?? {
          display: DISPLAY,
          toScreen: (pixel) => ({ x: pixel.x * 2, y: pixel.y * 2 }),
        },
      glance,
      quietMs: () => quiet,
      handOver,
    },
    window: {
      show: (_area, mark) => shown.push(mark({ x: 0, y: 0 })),
      hide: () => shown.push([]),
    },
    timer: (run, ms) => {
      const entry = { run, ms }

      timers.push(entry)

      return () => timers.splice(timers.indexOf(entry), 1)
    },
  })

  desk.call = (id) => (id === 'c1' ? line.call() : null)

  return {
    desk,
    line,
    shown,
    timers,
    handOver,
    setScene: (next: () => Scene) => {
      scene = next
    },
    touch: (at: number, quietMs: number) => {
      inputAt = at
      quiet = quietMs
    },
    tick: (ms: number) =>
      [...timers].filter((timer) => timer.ms === ms).forEach((timer) => timer.run()),
  }
}

const circle = {
  kind: 'circle' as const,
  corners: [
    { x: 10, y: 10 },
    { x: 60, y: 30 },
  ] as [{ x: number; y: number }, { x: number; y: number }],
}

describe('WalkthroughDesk', () => {
  it('refuses to draw when no walkthrough runs in the chat', async () => {
    const h = harness()

    await expect(h.desk.mark('other', circle, false)).resolves.toEqual({
      refusal: NOT_RUNNING,
      look: false,
    })
  })

  it('asks for a fresh screenshot when the latest one is no longer the screen', async () => {
    const h = harness({ aim: { refusal: 'The user paused you after your latest screenshot.' } })

    await expect(h.desk.mark('c1', circle, false)).resolves.toEqual({
      refusal: 'The user paused you after your latest screenshot.',
      look: true,
    })
  })

  it('draws a mark in screen points once the words before it are spoken', async () => {
    const h = harness()

    const outcome = await h.desk.mark('c1', circle, false)

    expect(outcome).toHaveProperty('note')
    expect(h.shown).toEqual([])

    h.line.hear()
    await settle()

    expect(h.shown).toEqual([
      [{ kind: 'circle', id: 1, box: { x: 20, y: 20, width: 100, height: 40 } }],
    ])
  })

  it('does not wait for a stuck voice forever', async () => {
    const h = harness()

    await h.desk.mark('c1', circle, false)
    h.tick(SPEECH_WAIT_MAX_MS)
    await settle()

    expect(h.shown).toHaveLength(1)
  })

  it('drops a mark whose words were cut off', async () => {
    const h = harness()

    await h.desk.mark('c1', circle, false)
    h.line.hear(false)
    await settle()

    expect(h.shown).toEqual([])
  })

  it('replaces marks unless asked to keep them, and puts the dimming under the rest', async () => {
    const h = harness()

    await h.desk.mark('c1', circle, false)
    h.line.hear()
    await h.desk.mark('c1', { kind: 'spotlight', corners: circle.corners }, true)
    h.line.hear()
    await settle()

    expect(h.shown.at(-1)?.map((mark) => mark.kind)).toEqual(['spotlight', 'circle'])

    await h.desk.mark(
      'c1',
      { kind: 'arrow', to: { x: 100, y: 100 }, from: { x: 300, y: 300 } },
      false,
    )
    h.line.hear()
    await settle()

    expect(h.shown.at(-1)).toEqual([
      { kind: 'arrow', id: 3, from: { x: 600, y: 600 }, to: { x: 200, y: 200 } },
    ])
  })

  it('skips a mark when the window under it changed before it was due and tells the model', async () => {
    const h = harness()

    await h.desk.mark('c1', circle, false)
    h.setScene(() => [{ ...WINDOW[0]!, id: 8 }])
    h.line.hear()
    await settle()

    expect(h.shown).toEqual([])

    const next = await h.desk.mark('c1', circle, false)

    expect(next).toMatchObject({ note: expect.stringContaining('was not drawn') as string })
  })

  it('clears the marks when the window under them moves', async () => {
    const h = harness()

    await h.desk.mark('c1', circle, false)
    h.line.hear()
    await settle()
    h.setScene(() => [{ ...WINDOW[0]!, bounds: { x: 100, y: 0, width: 900, height: 800 } }])
    h.tick(500)

    expect(h.shown.at(-1)).toEqual([])
  })

  it('lets a Computer Use action wait for its words, then clears the marks', async () => {
    const h = harness()

    await h.desk.mark('c1', circle, false)
    h.line.hear()
    await settle()

    const acting = h.desk.beforeAct('c1', new AbortController().signal)

    await settle()
    h.line.hear()
    await acting

    expect(h.shown.at(-1)).toEqual([])
  })

  it('stops a Computer Use action the person talked over', async () => {
    const h = harness()
    const acting = h.desk.beforeAct('c1', new AbortController().signal)

    await settle()
    h.line.hear(false)

    await expect(acting).rejects.toBeInstanceOf(ComputerError)
  })

  it('lets actions of chats without a walkthrough go at once', async () => {
    const h = harness()

    await expect(h.desk.beforeAct('other', new AbortController().signal)).resolves.toBeUndefined()
  })

  it('gives the mouse to the person and returns what they said while it waited', async () => {
    const h = harness()
    const waiting = h.desk.waitForUser('c1', 60_000)

    await settle()
    h.line.hear()
    await settle()

    expect(h.handOver).toHaveBeenCalledWith('c1')
    expect(h.desk.intercept('c1', 'Готово')).toBe(true)
    await expect(waiting).resolves.toContain('The user said: "Готово"')
    expect(h.desk.intercept('c1', 'Ещё')).toBe(false)
  })

  it('answers when the person did something and went quiet', async () => {
    const h = harness()
    const waiting = h.desk.waitForUser('c1', 60_000)

    await settle()
    h.line.hear()
    await settle()
    h.touch(5_000, 3_000)
    h.tick(400)

    await expect(waiting).resolves.toContain('did something on the screen')
  })

  it('hangs up once the last words are spoken', async () => {
    const h = harness()
    const finishing = h.desk.finish('c1')

    await settle()
    h.line.hear()

    await expect(finishing).resolves.toContain('recap')
    expect(h.line.end).toHaveBeenCalled()
  })

  it('keeps the call when the person talks over the last words', async () => {
    const h = harness()
    const finishing = h.desk.finish('c1')

    await settle()
    h.line.hear(false)

    await expect(finishing).resolves.toContain('the call goes on')
    expect(h.line.end).not.toHaveBeenCalled()
  })

  it('clears the marks and the wait when the walkthrough call ends', async () => {
    const h = harness()

    await h.desk.mark('c1', circle, false)
    h.line.hear()
    await settle()

    const waiting = h.desk.waitForUser('c1', 60_000)

    await settle()
    h.line.hear()
    await settle()
    h.desk.ended('c1')

    expect(h.shown.at(-1)).toEqual([])
    await expect(waiting).resolves.toBe('The walkthrough ended.')
  })
})
