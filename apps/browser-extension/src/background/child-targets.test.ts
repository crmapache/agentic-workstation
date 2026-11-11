import { it, expect, describe } from 'vitest'

import { ChildTargets } from './child-targets'

/** Target.attachedToTarget, как его шлёт Chrome. */
const attachedEvent = (sessionId: string, frameId: string, url: string, type = 'iframe') => ({
  sessionId,
  targetInfo: { targetId: frameId, type, url, title: '', attached: true },
  waitingForDebugger: false,
})

describe('фреймы других процессов во вкладке', () => {
  it('запоминает фрейм и отдаёт его сессию по id фрейма; воркер - не фрейм', () => {
    const targets = new ChildTargets()

    expect(targets.attached(7, null, attachedEvent('s1', 'F1', 'https://pay.example/'))).toBe('s1')
    expect(targets.attached(7, null, attachedEvent('s2', 'W1', 'https://x/', 'worker'))).toBeNull()
    expect(targets.attached(7, null, { sessionId: 's3' })).toBeNull()

    expect(targets.sessionOf(7, 'F1')).toBe('s1')
    expect(targets.sessionOf(7, 'W1')).toBeNull()
    expect(targets.sessionOf(8, 'F1')).toBeNull()
    expect(targets.list(7)).toEqual([{ frameId: 'F1', url: 'https://pay.example/' }])
  })

  it('ушёл фрейм - уходят и вложенные в него; ушёл отладчик - все фреймы вкладки', () => {
    const targets = new ChildTargets()

    targets.attached(7, null, attachedEvent('outer', 'F1', 'https://b.example/'))
    targets.attached(7, 'outer', attachedEvent('inner', 'F2', 'https://a.example/deep'))
    targets.attached(7, null, attachedEvent('other', 'F3', 'https://c.example/'))
    targets.detached(7, { sessionId: 'outer', targetId: 'F1' })

    expect(targets.list(7).map((frame) => frame.frameId)).toEqual(['F3'])

    targets.forget(7)

    expect(targets.list(7)).toEqual([])
  })

  it('фрейм ушёл на другой адрес - список говорит новый', () => {
    const targets = new ChildTargets()

    targets.attached(7, null, attachedEvent('s1', 'F1', 'https://b.example/one'))
    targets.changed(7, { targetInfo: { targetId: 'F1', url: 'https://b.example/two' } })

    expect(targets.list(7)).toEqual([{ frameId: 'F1', url: 'https://b.example/two' }])
  })
})
