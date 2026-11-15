import { it, expect, describe } from 'vitest'

import { BrowserSessions } from './browser-sessions'
import type { HeldTab } from './browser-sessions'
import { TabRest } from './tab-rest'

/** Сессия с вкладками; отдых записывает, какие вкладки отпущены, и снимает с них флаги. */
const setup = () => {
  const sessions = new BrowserSessions()
  const session = sessions.ensure('tab-1', 'AW · project')
  const rested: number[] = []
  let gate: Promise<void> = Promise.resolve()
  const rest = new TabRest(sessions, async (tab: HeldTab) => {
    await gate
    rested.push(tab.tabId)
    tab.attached = false
    tab.framed = false
  })
  const hold = (tabId: number, lastUsed: number, tab: Partial<HeldTab> = {}) =>
    Object.assign(sessions.hold(session, 'work', tabId, true, lastUsed)!, {
      attached: true,
      framed: true,
      ...tab,
    })

  return {
    rest,
    rested,
    hold,
    hang: () => {
      let open = () => undefined as void

      gate = new Promise((resolve) => {
        open = resolve
      })

      return () => open()
    },
  }
}

/** Работа вызова, которую тест отпускает сам. */
const held = () => {
  let finish = () => undefined as void
  const work = () =>
    new Promise<void>((resolve) => {
      finish = resolve
    })

  return { work, finish: () => finish() }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('отдых вкладок агента', () => {
  it('работа встала - отпускаются вкладки, где есть что снять, включая рамку без отладчика', async () => {
    const { rest, rested, hold } = setup()

    hold(1, 0)
    hold(2, 0, { attached: false })
    hold(3, 0, { attached: false, framed: false })
    hold(4, 0, { offline: true, attached: false })

    rest.idle('tab-1')
    rest.idle('other')
    await rest.during('tab-1', () => Promise.resolve())

    expect(rested).toEqual([1, 2])
  })

  it('вызов идёт - отдых ждёт его конца; новый вызов отменяет отложенный отдых', async () => {
    const { rest, rested, hold } = setup()
    const first = held()
    const second = held()

    hold(1, 0)

    const running = rest.during('tab-1', first.work)

    rest.idle('tab-1')
    await settle()
    expect(rested).toEqual([])

    first.finish()
    await running
    await rest.during('tab-1', () => Promise.resolve())
    expect(rested).toEqual([1])

    const tab = hold(1, 0)
    const again = rest.during('tab-1', first.work)

    rest.idle('tab-1')

    // Работа пошла снова: второй вызов того же разговора отменяет отдых, отложенный первым.
    const resumed = rest.during('tab-1', second.work)

    await settle()
    first.finish()
    second.finish()
    await Promise.all([again, resumed])
    await settle()

    expect(rested).toEqual([1])
    expect(tab.framed).toBe(true)
  })

  it('новый вызов дожидается отдыха, который уже начался', async () => {
    const { rest, rested, hold, hang } = setup()
    const open = hang()
    const order: string[] = []

    hold(1, 0)
    rest.idle('tab-1')

    const call = rest.during('tab-1', () => {
      order.push(`work after ${rested.length}`)

      return Promise.resolve()
    })

    await settle()
    expect(order).toEqual([])

    open()
    await call

    expect(order).toEqual(['work after 1'])
  })

  it('простой: отпускаются только давно не тронутые вкладки и не у сессии с идущим вызовом', async () => {
    const { rest, rested, hold } = setup()
    const step = held()

    hold(1, 0)
    hold(2, 50_000)

    const running = rest.during('tab-1', step.work)

    rest.sweep(61_000, 60_000)
    await settle()
    expect(rested).toEqual([])

    step.finish()
    await running
    rest.sweep(61_000, 60_000)
    await rest.during('tab-1', () => Promise.resolve())

    expect(rested).toEqual([1])
  })
})
