import { it, expect, describe } from 'vitest'

import type { InboxItem, InboxAction } from '@shared/inbox'

import { buttonsOf, subjectOf, expandedByDefault } from './InboxCard.utils'

const item = (patch: Partial<InboxItem>): InboxItem => ({
  id: 'i',
  kind: 'message',
  tone: 'info',
  title: 'Build is ready',
  body: '',
  source: 'Release chat',
  projectPath: '',
  origin: { kind: 'none' },
  actions: [],
  questions: [],
  tool: '',
  detail: '',
  reason: '',
  requestId: '',
  createdAt: 1,
  deliverAt: 1,
  arrivedAt: 1,
  readAt: 0,
  doneAt: 0,
  outcome: '',
  ...patch,
})

describe('карточка уведомления на виде', () => {
  it('раскрыта сама только та, что ждёт ответа: вопрос, разрешение, план', () => {
    expect(expandedByDefault(item({ kind: 'question' }))).toBe(true)
    expect(expandedByDefault(item({ kind: 'permission' }))).toBe(true)
    expect(expandedByDefault(item({ kind: 'plan' }))).toBe(true)
    expect(expandedByDefault(item({ kind: 'report' }))).toBe(false)
    expect(expandedByDefault(item({ kind: 'message' }))).toBe(false)
  })

  it('отвеченный вопрос уходит в Done свёрнутым', () => {
    expect(expandedByDefault(item({ kind: 'question', doneAt: 5 }))).toBe(false)
  })

  it('своя тема - у сообщения ИИ; у прогона заголовок - имя задания, у отчёта темы нет', () => {
    expect(subjectOf(item({}))).toBe('Build is ready')
    expect(subjectOf(item({ kind: 'question', title: 'Nightly', source: 'Nightly' }))).toBe('')
    expect(subjectOf(item({ kind: 'report' }))).toBe('')
    expect(subjectOf(item({ kind: 'failure' }))).toBe('')
  })

  it('в окне своего прогона нет «открыть прогон», на виде и в баннере - есть', () => {
    const asking = item({
      kind: 'permission',
      actions: (['allow', 'deny', 'showRun'] as const).map((kind): InboxAction => ({
        id: kind,
        kind,
        label: '',
        value: '',
        primary: false,
      })),
    })

    expect(buttonsOf(asking).map((one) => one.kind)).toEqual(['allow', 'deny', 'showRun'])
    expect(buttonsOf(asking, true).map((one) => one.kind)).toEqual(['allow', 'deny'])
  })
})
