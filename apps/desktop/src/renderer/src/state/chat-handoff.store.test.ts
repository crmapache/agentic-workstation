import { it, expect, describe, beforeEach } from 'vitest'

import { handoffsFor, useChatHandoffStore } from './chat-handoff.store'

const file = { kind: 'ref' as const, value: 'a.ts', range: 'L1' }
const card = { kind: 'card' as const, value: 'c-1', text: 'Fix' }

describe('передача в чат провайдера', () => {
  beforeEach(() => useChatHandoffStore.setState({ pending: [] }))

  it('кусок без провайдера ждёт любую панель, с провайдером - только его, чужой проект - свою', () => {
    const { hand } = useChatHandoffStore.getState()

    hand({ projectId: 'p1', chip: file })
    hand({ projectId: 'p1', chip: card, provider: 'codex', fresh: true })
    hand({ projectId: 'p2', chip: file })

    const { pending } = useChatHandoffStore.getState()

    expect(handoffsFor(pending, 'p1', 'claude').map((one) => one.chip)).toEqual([file])
    expect(handoffsFor(pending, 'p1', 'codex').map((one) => one.chip)).toEqual([file, card])
  })

  it('взятый кусок больше не ждёт, и второй раз его не взять', () => {
    useChatHandoffStore.getState().hand({ projectId: 'p1', chip: file })

    const mine = handoffsFor(useChatHandoffStore.getState().pending, 'p1', 'claude')

    expect(useChatHandoffStore.getState().take(mine)).toEqual(mine)
    expect(useChatHandoffStore.getState().take(mine)).toEqual([])
    expect(useChatHandoffStore.getState().pending).toEqual([])
  })
})
