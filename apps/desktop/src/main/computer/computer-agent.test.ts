import { it, vi, expect, describe, beforeEach } from 'vitest'

import { ComputerAgent } from './computer-agent'
import { ComputerDesk } from './computer-desk'
import type { DeskClock } from './computer-desk'
import type { Display } from './computer-geometry'
import { ComputerHand } from './computer-hand'
import { parseChord, PLATFORM_KEYMAP } from './computer-keys'
import type * as Constants from './computer.constants'
import type { Point, InputDriver } from './computer.types'
import type { SceneWindow } from './screen-scene'

vi.mock('electron', () => ({ shell: {}, desktopCapturer: {}, systemPreferences: {} }))

const DISPLAY: Display = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
  isMain: true,
}

/** Снимки - подделка: каждый считается, координаты снимка совпадают с точками экрана. */
const screen = vi.hoisted(() => ({ shots: 0 }))

vi.mock('./computer-screen', () => ({
  listDisplays: () => [DISPLAY],
  shootDisplay: (display: Display) => {
    screen.shots += 1

    return Promise.resolve({
      data: `shot-${screen.shots}`,
      mimeType: 'image/png',
      frame: { display, width: 1920, height: 1080 },
    })
  },
  shootRegion: () => Promise.resolve({ data: 'zoom', mimeType: 'image/png' }),
}))

// Приложение перерисовывается мгновенно: тест не ждёт настоящих 450 мс.
vi.mock('./computer.constants', async (importOriginal) => ({
  ...(await importOriginal<typeof Constants>()),
  SETTLE_AFTER_ACTION_MS: 0,
}))

const window = (id: number, x: number, y: number): SceneWindow => ({
  id,
  isOrdinary: true,
  bounds: { x, y, width: 800, height: 600 },
})

/**
 * Машина: мышь и клавиатура пишут, что дошло до системы, и, как настоящие, сбрасывают счётчик
 * ввода; окна и время последнего ввода видит свидетель. Таймеры стола - по команде теста.
 */
const machine = () => {
  const presses: Point[] = []
  const keys: number[] = []
  let at: Point = { x: 10, y: 10 }
  let lastInput = performance.now() - 60_000
  let scene: SceneWindow[] = [window(1, 0, 0), window(2, 1000, 0)]
  const input: InputDriver = {
    cursor: () => at,
    mouse: (motion, point) => {
      at = point
      lastInput = performance.now()
      if (motion === 'down') presses.push(point)
    },
    key: (code, isDown) => {
      lastInput = performance.now()
      if (isDown) keys.push(code)
    },
    text: () => undefined,
    typing: { chunk: 20, holdMs: 0, gapMs: 0 },
    scroll: () => undefined,
    heldFlags: () => 0,
    isButtonHeld: () => false,
  }
  const timers = new Map<number, () => void>()
  let next = 0
  const clock: DeskClock = {
    setTimeout: (run) => {
      next += 1
      timers.set(next, run)

      return next
    },
    clearTimeout: (timer) => timers.delete(timer as number),
  }
  const desk = new ComputerDesk(() => undefined, clock)
  const finished: string[] = []
  const agent = new ComputerAgent({
    desk,
    hand: new ComputerHand(input, {
      random: () => 0.5,
      now: () => 0,
      sleep: () => Promise.resolve(),
    }),
    access: () => ({ supported: true, needsPermissions: true, accessibility: true, screen: true }),
    passThrough: () => undefined,
    covers: () => false,
    hiddenFromShot: (shoot) => shoot(),
    witness: { scene: () => scene, idleMs: () => performance.now() - lastInput },
    finished: (key) => finished.push(key),
  })

  return {
    agent,
    finished,
    desk,
    presses,
    keys,
    /** Человек тронул мышь или клавиатуру, не сдвинув курсор. */
    touch: () => {
      lastInput = performance.now() + 1000
    },
    setScene: (next: SceneWindow[]) => {
      scene = next
    },
    /** Минута без вызовов: стол отпускает компьютер. */
    idleMinute: () => [...timers.values()].forEach((run) => run()),
  }
}

const call = {
  key: 'chat',
  label: 'project',
  step: { kind: 'intent', text: 'Clicking' },
  signal: undefined,
} as const
const CLICK = { button: 'left', count: 1, chord: null } as const

beforeEach(() => {
  screen.shots = 0
})

describe('computer agent looks before it acts', () => {
  it('acts on a fresh screenshot and answers with the next one', async () => {
    const { agent, presses } = machine()

    await agent.screenshot(call, null, 0)

    const answer = await agent.click(call, { x: 100, y: 100 }, CLICK)

    expect(answer.isRefusal).toBeUndefined()
    expect(presses).toEqual([{ x: 100, y: 100 }])
    expect(answer.picture.data).toBe('shot-2')

    // Свой клик сбросил счётчик ввода до снимка после него: следующее действие идёт.
    await agent.click(call, { x: 120, y: 100 }, CLICK)
    expect(presses).toHaveLength(2)
  })

  it('without a screenshot does nothing and shows the screen', async () => {
    const { agent, presses } = machine()

    const answer = await agent.click(call, { x: 100, y: 100 }, CLICK)

    expect(presses).toEqual([])
    expect(answer).toMatchObject({ isRefusal: true, picture: { data: 'shot-1' } })
    expect(answer.text).toMatch(/^You have no screenshot of the screen yet\. Nothing was done/)
  })

  it('after a break, the first action only looks; the next one on that screenshot goes', async () => {
    const { agent, presses, idleMinute } = machine()

    await agent.screenshot(call, null, 0)
    idleMinute()

    const looked = await agent.click(call, { x: 100, y: 100 }, CLICK)

    expect(presses).toEqual([])
    expect(looked.isRefusal).toBe(true)
    expect(looked.text).toMatch(/from before a break/)
    expect(looked.text).toMatch(/this screenshot shows the screen now/)

    await agent.click(call, { x: 100, y: 100 }, CLICK)
    expect(presses).toEqual([{ x: 100, y: 100 }])
  })

  it('after a pause, too', async () => {
    const { agent, desk, presses } = machine()

    await agent.screenshot(call, null, 0)
    desk.pause()
    desk.resume()

    const looked = await agent.click(call, { x: 100, y: 100 }, CLICK)

    expect(presses).toEqual([])
    expect(looked.text).toMatch(/paused you/)
  })

  it('the user touched the mouse or keyboard after the screenshot', async () => {
    const { agent, presses, touch } = machine()

    await agent.screenshot(call, null, 0)
    touch()

    const looked = await agent.click(call, { x: 100, y: 100 }, CLICK)

    expect(presses).toEqual([])
    expect(looked).toMatchObject({ isRefusal: true, picture: { data: 'shot-2' } })
    expect(looked.text).toMatch(/used the mouse or keyboard/)
  })

  it('a window opened over the point', async () => {
    const { agent, presses, setScene } = machine()

    await agent.screenshot(call, null, 0)
    setScene([window(3, 50, 50), window(1, 0, 0), window(2, 1000, 0)])

    const looked = await agent.click(call, { x: 100, y: 100 }, CLICK)

    expect(presses).toEqual([])
    expect(looked.text).toMatch(/windows where you aimed changed/)

    // Окно открылось в другом месте: клик туда, где всё как на снимке, идёт.
    setScene([window(3, 50, 50), window(1, 0, 0), window(2, 1000, 0), window(4, 1500, 700)])
    await agent.click(call, { x: 100, y: 100 }, CLICK)
    expect(presses).toEqual([{ x: 100, y: 100 }])
  })

  it('keys do not go when another window came to the front', async () => {
    const { agent, keys, setScene } = machine()
    const escape = parseChord('escape', PLATFORM_KEYMAP)

    await agent.screenshot(call, null, 0)
    setScene([window(2, 1000, 0), window(1, 0, 0)])

    const looked = await agent.key(call, escape, 'escape', 1)

    expect(keys).toEqual([])
    expect(looked.text).toMatch(/the keys would go there/)

    await agent.key(call, escape, 'escape', 1)
    expect(keys).toEqual([escape.key])
  })

  it('zoom of a screenshot from before a break asks for a new one', async () => {
    const { agent, idleMinute } = machine()

    await agent.screenshot(call, null, 0)
    idleMinute()

    await expect(agent.zoom(call, [0, 0, 100, 100])).rejects.toMatchObject({
      code: 'no-shot',
      message: expect.stringMatching(/from before a break.*Take a new screenshot\.$/) as unknown,
    })
  })
})

describe('the end of the work brings the user back to the chat', () => {
  it('a conversation that used the computer returns once its work stops', async () => {
    const { agent, finished } = machine()

    await agent.screenshot(call, null, 0)
    await agent.click(call, { x: 100, y: 100 }, CLICK)
    agent.idle(call.key)
    // Следующий конец работы без компьютера - уже без возврата.
    agent.idle(call.key)

    expect(finished).toEqual([call.key])
  })

  it('also after a quiet minute let the computer go mid-work', async () => {
    const { agent, finished, idleMinute } = machine()

    await agent.screenshot(call, null, 0)
    idleMinute()
    expect(finished).toEqual([])

    agent.idle(call.key)
    expect(finished).toEqual([call.key])
  })

  it('a conversation that did not use the computer does not pull the window', () => {
    const { agent, finished } = machine()

    agent.idle(call.key)

    expect(finished).toEqual([])
  })

  it('the user touched the mouse or keyboard after the last step: they work themselves', async () => {
    const { agent, finished, touch } = machine()

    await agent.screenshot(call, null, 0)
    touch()
    agent.idle(call.key)

    expect(finished).toEqual([])
  })

  it('an ended conversation or process does not return', async () => {
    const { agent, finished } = machine()

    await agent.screenshot(call, null, 0)
    agent.release(call.key)
    agent.idle(call.key)

    expect(finished).toEqual([])
  })
})
