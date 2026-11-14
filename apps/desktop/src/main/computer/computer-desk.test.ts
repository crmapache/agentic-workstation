import { it, expect, describe } from 'vitest'

import type { CapsuleView } from '@shared/computer'

import { ComputerDesk } from './computer-desk'
import type { DeskClock } from './computer-desk'

/** Таймеры, которые срабатывают только по команде теста. */
const manualClock = () => {
  const timers = new Map<number, () => void>()
  let next = 0
  const clock: DeskClock = {
    setTimeout: (run) => {
      next += 1
      timers.set(next, run)

      return next
    },
    clearTimeout: (timer) => {
      timers.delete(timer as number)
    },
  }

  return { clock, fireAll: () => [...timers.values()].forEach((run) => run()) }
}

const setup = () => {
  const views: (CapsuleView | null)[] = []
  const { clock, fireAll } = manualClock()
  const desk = new ComputerDesk((view) => views.push(view), clock)

  return { desk, views, fireAll }
}

/** Дать очереди стола дойти до работы. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const CLICK = { kind: 'intent', text: 'Opening the menu' } as const

const call = (key: string) => ({ key, label: `project ${key}`, step: CLICK, signal: undefined })

/** Работа, которая ждёт, пока тест её отпустит или её оборвут. */
const held = () => {
  let finish = () => undefined as void
  const work = (signal: AbortSignal) =>
    new Promise<string>((resolve, reject) => {
      finish = () => resolve('done')
      signal.addEventListener('abort', () => reject(new Error('aborted')))
    })

  return { work, finish: () => finish() }
}

describe('computer desk', () => {
  it('shows the capsule while a conversation holds the computer and hides it after a quiet minute', async () => {
    const { desk, views, fireAll } = setup()

    await desk.run(call('a'), () => Promise.resolve(1))

    expect(desk.view()).toEqual({ state: 'ready', activity: null })
    expect(views).toContainEqual({ state: 'working', activity: CLICK })

    fireAll()

    expect(desk.view()).toBeNull()
  })

  it('shows what the model said between steps, and drops it when the next step starts', async () => {
    const { desk } = setup()
    const step = held()

    await desk.run(call('a'), () => Promise.resolve(1))
    desk.heard('b', 'Someone else')
    desk.heard('a', 'The menu is open.')

    expect(desk.view()).toEqual({
      state: 'ready',
      activity: { kind: 'said', text: 'The menu is open.' },
    })

    const running = desk.run(call('a'), step.work)

    await settle()

    expect(desk.view()).toEqual({ state: 'working', activity: CLICK })

    step.finish()
    await running

    expect(desk.view()).toEqual({ state: 'ready', activity: null })
  })

  it('tells another conversation that the computer is busy', async () => {
    const { desk } = setup()

    await desk.run(call('a'), () => Promise.resolve(1))

    await expect(desk.run(call('b'), () => Promise.resolve(2))).rejects.toMatchObject({
      code: 'busy',
    })
  })

  it('pause stops the running action, and the next call waits for resume', async () => {
    const { desk } = setup()
    const first = held()
    const running = desk.run(call('a'), first.work)

    await settle()
    desk.pause()

    await expect(running).rejects.toMatchObject({ code: 'paused' })
    expect(desk.view()?.state).toBe('paused')

    let isDone = false
    const next = desk
      .run(call('a'), (_signal, pausedMs) => Promise.resolve(pausedMs))
      .then((pausedMs) => {
        isDone = true

        return pausedMs
      })

    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(isDone).toBe(false)

    desk.resume()

    // Работа узнаёт, сколько простояла на паузе: экран за это время мог поменяться.
    expect(await next).toBeGreaterThan(0)
  })

  it('stop during a call is told to that call, and the next call starts afresh', async () => {
    const { desk } = setup()
    const first = held()
    const running = desk.run(call('a'), first.work)

    await settle()

    // По этому ключу Stop в капсуле останавливает и ход разговора (ComputerRuntime.stopped).
    expect(desk.holding).toBe('a')

    desk.stop()

    await expect(running).rejects.toMatchObject({ code: 'stopped' })
    expect(desk.view()).toBeNull()
    expect(desk.holding).toBeNull()
    await expect(desk.run(call('a'), () => Promise.resolve(2))).resolves.toBe(2)
  })

  it('stop between calls is told once, to the next call', async () => {
    const { desk } = setup()

    await desk.run(call('a'), () => Promise.resolve(1))
    desk.stop()

    await expect(desk.run(call('a'), () => Promise.resolve(2))).rejects.toMatchObject({
      code: 'stopped',
    })
    await expect(desk.run(call('a'), () => Promise.resolve(3))).resolves.toBe(3)
  })

  it('turning the connector off during a pause cuts the waiting call before it works', async () => {
    const { desk } = setup()
    let isWorked = false

    await desk.run(call('a'), () => Promise.resolve(1))
    desk.pause()

    const waiting = desk.run(call('a'), () => {
      isWorked = true

      return Promise.resolve(2)
    })

    await settle()
    desk.dispose()

    await expect(waiting).rejects.toMatchObject({ code: 'cancelled' })
    expect(isWorked).toBe(false)
    expect(desk.view()).toBeNull()
  })

  it('a call cancelled during a pause gives up and never works', async () => {
    const { desk } = setup()
    const cancel = new AbortController()
    let isWorked = false

    await desk.run(call('a'), () => Promise.resolve(1))
    desk.pause()

    const waiting = desk.run({ ...call('a'), signal: cancel.signal }, () => {
      isWorked = true

      return Promise.resolve(2)
    })

    await settle()
    cancel.abort()
    desk.resume()

    await expect(waiting).rejects.toMatchObject({ code: 'cancelled' })
    expect(isWorked).toBe(false)
  })

  it('a pause that lasts too long ends the waiting call with a question to the user', async () => {
    const { desk, fireAll } = setup()

    await desk.run(call('a'), () => Promise.resolve(1))
    desk.pause()

    const waiting = desk.run(call('a'), () => Promise.resolve(2))

    await settle()
    fireAll()

    await expect(waiting).rejects.toMatchObject({ code: 'paused' })
    expect(desk.pauses).toBe(1)
  })

  it('a call cancelled while it waits in the queue never works', async () => {
    const { desk } = setup()
    const first = held()
    const cancel = new AbortController()
    let isWorked = false
    const running = desk.run(call('a'), first.work)
    const queued = desk.run({ ...call('a'), signal: cancel.signal }, () => {
      isWorked = true

      return Promise.resolve(2)
    })

    await settle()
    cancel.abort()
    first.finish()

    await expect(running).resolves.toBe('done')
    await expect(queued).rejects.toMatchObject({ code: 'cancelled' })
    expect(isWorked).toBe(false)
  })

  it('stop wakes a call that waited on pause with the stop news', async () => {
    const { desk } = setup()

    await desk.run(call('a'), () => Promise.resolve(1))
    desk.pause()

    const waiting = desk.run(call('a'), () => Promise.resolve(2))

    await settle()
    desk.stop()

    await expect(waiting).rejects.toMatchObject({ code: 'stopped' })
  })

  it('lets the computer go when its conversation ends', async () => {
    const { desk } = setup()

    await desk.run(call('a'), () => Promise.resolve(1))
    desk.endConversation('a')

    expect(desk.view()).toBeNull()
    await expect(desk.run(call('b'), () => Promise.resolve(2))).resolves.toBe(2)
  })
})
