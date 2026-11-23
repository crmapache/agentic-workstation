import { it, expect, describe } from 'vitest'

import type { Conversation } from '@shared/conversation'

import type { ChatHandoff } from '../../state/chat-handoff.store'
import { handoffStep } from './chat-handoff.utils'

const blank = {
  id: 'blank',
  title: '',
  titleSource: 'default',
  outcome: 'none',
  status: 'idle',
  queue: [],
  fork: null,
} as unknown as Conversation
const busy = { ...blank, id: 'busy', title: 'Fix the cache', titleSource: 'llm' } as Conversation

const snippet: ChatHandoff = { projectId: 'p1', chip: { kind: 'ref', value: 'a.ts' } }
const card: ChatHandoff = {
  projectId: 'p1',
  chip: { kind: 'card', value: 'c-1', text: 'Fix' },
  provider: 'claude',
  fresh: true,
}
const open = { isFieldEmpty: true, emptied: false }

describe('куски для панели провайдера', () => {
  it('без «нового чата» - в активную вкладку, какой бы она ни была', () => {
    expect(handoffStep([snippet], { ...open, active: busy })).toEqual({
      kind: 'insert',
      handoffs: [snippet],
    })
  })

  it('карточка - в пустую вкладку с пустым полем, иначе сначала новый разговор', () => {
    expect(handoffStep([card], { ...open, active: blank })).toEqual({
      kind: 'insert',
      handoffs: [card],
    })
    expect(handoffStep([card], { ...open, active: busy })).toEqual({ kind: 'create' })
    expect(handoffStep([card], { ...open, active: blank, isFieldEmpty: false })).toEqual({
      kind: 'create',
    })
  })

  it('две карточки подряд - по одной на разговор', () => {
    const second = { ...card, chip: { kind: 'card' as const, value: 'c-2', text: 'Next' } }

    expect(handoffStep([card, second], { ...open, active: blank })).toEqual({
      kind: 'insert',
      handoffs: [card],
    })
  })

  it("вкладки нет: панель заводит её сама - ждать; «Let's start» - карточка заводит разговор", () => {
    expect(handoffStep([card], { ...open, active: null })).toEqual({ kind: 'wait' })
    expect(handoffStep([card], { ...open, active: null, emptied: true })).toEqual({
      kind: 'create',
    })
    expect(handoffStep([snippet], { ...open, active: null, emptied: true })).toEqual({
      kind: 'wait',
    })
    expect(handoffStep([], { ...open, active: blank })).toEqual({ kind: 'wait' })
  })
})
