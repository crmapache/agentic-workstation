import { it, expect, describe } from 'vitest'

import { tabKey, BrowserSessions } from './browser-sessions'

describe('сессии браузера по процессам разговоров', () => {
  it('у каждого запуска своя сессия; одинаковые имена групп различаются номером', () => {
    const sessions = new BrowserSessions()
    const a = sessions.ensure('launch-a', 'AW · web')
    const b = sessions.ensure('launch-b', 'AW · web')

    expect(sessions.ensure('launch-a', 'AW · other')).toBe(a)
    expect([a.title, b.title]).toEqual(['AW · web', 'AW · web 2'])
  })

  it('вкладку одной сессии другая не берёт', () => {
    const sessions = new BrowserSessions()
    const a = sessions.ensure('a', 'A')
    const b = sessions.ensure('b', 'B')

    expect(sessions.hold(a, 'p1', 5, false, 0)).toMatchObject({ key: 'p1/5', owned: false })
    expect(sessions.hold(b, 'p1', 5, false, 0)).toBeNull()
    expect(sessions.holderOf(tabKey('p1', 5))).toBe(a)
  })

  it('последняя взятая - текущая; закрытая человеком уходит, текущей становится оставшаяся', () => {
    const sessions = new BrowserSessions()
    const a = sessions.ensure('a', 'A')

    sessions.hold(a, 'p1', 1, true, 0)
    sessions.hold(a, 'p1', 2, true, 0)
    expect(a.current).toBe('p1/2')

    expect(sessions.tabClosed('p1', 2)).toBe(a)
    expect(a.current).toBe('p1/1')
    expect(sessions.tabClosed('p1', 99)).toBeNull()
  })

  it('закрытая человеком группа забывается', () => {
    const sessions = new BrowserSessions()
    const a = sessions.ensure('a', 'A')

    a.group = { profileKey: 'p1', groupId: 7 }
    expect(sessions.groupClosed('p2', 7)).toBeNull()
    expect(sessions.groupClosed('p1', 7)).toBe(a)
    expect(a.group).toBeNull()
  })

  it('конец сессии: свои вкладки закрыть, взятые отпустить', () => {
    const sessions = new BrowserSessions()
    const a = sessions.ensure('a', 'A')

    sessions.hold(a, 'p1', 1, true, 0)
    sessions.hold(a, 'p1', 2, false, 0)

    const end = sessions.end('a')

    expect(end?.owned.map((tab) => tab.tabId)).toEqual([1])
    expect(end?.taken.map((tab) => tab.tabId)).toEqual([2])
    expect(sessions.get('a')).toBeNull()
    expect(sessions.end('a')).toBeNull()
  })

  it('отключённый профиль не забывает вкладки и группу, а помечает их без связи', () => {
    const sessions = new BrowserSessions()
    const a = sessions.ensure('a', 'A')

    a.group = { profileKey: 'p1', groupId: 3 }
    sessions.hold(a, 'p1', 1, true, 0)!.attached = true
    sessions.hold(a, 'p2', 1, false, 0)

    expect(sessions.profileOffline('p1').map((tab) => tab.key)).toEqual(['p1/1'])
    expect([...a.tabs.keys()]).toEqual(['p1/1', 'p2/1'])
    expect(a.tabs.get('p1/1')).toMatchObject({ offline: true, attached: false })
    expect(a.tabs.get('p2/1')?.offline).toBe(false)
    expect(a.group).toEqual({ profileKey: 'p1', groupId: 3 })
    expect(sessions.heldIn('p1')).toEqual([{ session: a, tab: a.tabs.get('p1/1') }])
  })

  it('текущей становится другая вкладка, если этой пользоваться нельзя', () => {
    const sessions = new BrowserSessions()
    const a = sessions.ensure('a', 'A')

    sessions.hold(a, 'p1', 1, true, 0)
    sessions.hold(a, 'p1', 2, true, 0)
    sessions.moveCurrentFrom(a, 'p1/2')
    expect(a.current).toBe('p1/1')
    sessions.moveCurrentFrom(a, 'p1/2')
    expect(a.current).toBe('p1/1')
  })

  it('сводка для окна расширения - по профилю; простой - по времени последнего вызова', () => {
    const sessions = new BrowserSessions()
    const a = sessions.ensure('a', 'A')
    const fresh = sessions.hold(a, 'p1', 1, true, 1000)
    const stale = sessions.hold(a, 'p1', 2, true, 0)

    if (!fresh || !stale) throw new Error('hold failed')

    fresh.attached = true
    stale.attached = true
    sessions.hold(a, 'p2', 9, false, 0)

    expect(sessions.summaries('p1')).toEqual([{ id: 'a', title: 'A', tabIds: [1, 2] }])
    expect(sessions.summaries('p3')).toEqual([])
    expect(sessions.idle(61_000, 60_000).map((tab) => tab.tabId)).toEqual([2])
  })
})
