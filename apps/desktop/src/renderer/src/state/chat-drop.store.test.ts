import { it, expect, describe, beforeEach } from 'vitest'

import type { DraftChip } from '@shared/message-draft'

import { dropIntoChat, registerChatDrop, useChatDropStore } from './chat-drop.store'

const card = { kind: 'card' as const, value: 'c-1', text: 'Fix' }

describe('бросок в поле чата', () => {
  beforeEach(() => useChatDropStore.setState({ over: null }))

  it('чип уходит только в то поле, над которым бросили', () => {
    const first: DraftChip[] = []
    const second: DraftChip[] = []
    const offFirst = registerChatDrop('z1', (chip) => first.push(chip))
    const offSecond = registerChatDrop('z2', (chip) => second.push(chip))

    dropIntoChat('z2', card)

    expect(first).toEqual([])
    expect(second).toEqual([card])
    offFirst()
    offSecond()
  })

  it('поле ушло с экрана - бросок ничего не делает, и отписка старого не снимает новое', () => {
    const old: DraftChip[] = []
    const fresh: DraftChip[] = []
    const offOld = registerChatDrop('z', (chip) => old.push(chip))
    const offFresh = registerChatDrop('z', (chip) => fresh.push(chip))

    offOld()
    dropIntoChat('z', card)
    offFresh()
    dropIntoChat('z', card)

    expect(old).toEqual([])
    expect(fresh).toEqual([card])
  })

  it('то же поле под рукой каждым кадром не будит подписчиков', () => {
    let calls = 0
    const stop = useChatDropStore.subscribe(() => (calls += 1))
    const { setOver } = useChatDropStore.getState()

    setOver('z')
    setOver('z')
    setOver(null)
    setOver(null)
    stop()

    expect(calls).toBe(2)
  })
})
