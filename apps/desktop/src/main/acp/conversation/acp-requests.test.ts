import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import type { AcpPermissionRequest, AcpElicitationRequest } from '../protocol/acp-types'
import { replyOf, holdForm, planTextOf, holdPermission } from './acp-requests'

type Row = { from: string; message: { method?: string; params?: unknown } }

/** Вопрос `ExitPlanMode` из живой записи Kimi 2.7 (ADR 0092). */
const kimiPlanRequest = (): AcpPermissionRequest => {
  const lines = readFileSync(
    join(__dirname, '..', '__fixtures__', 'kimi-session.ndjson'),
    'utf8',
  ).split('\n')
  const row = lines
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Row)
    .find(
      (one) =>
        one.message.method === 'session/request_permission' &&
        (one.message.params as AcpPermissionRequest).toolCall.title === 'ExitPlanMode',
    )

  return row?.message.params as AcpPermissionRequest
}

const noop = () => undefined

describe('план Kimi', () => {
  it('карточка плана несёт текст плана из вопроса', () => {
    const request = kimiPlanRequest()
    const held = holdPermission('r1', request, 'call_x', null, 'plan', noop)

    expect(held.source).toBe('plan')
    expect(held.pending.kind === 'plan' && held.pending.plan).toContain('subtract')
    expect(planTextOf(request)).toContain('subtract')
  })

  it('«доработать» без замечания - plan_revise, а не выход из плана', () => {
    const held = holdPermission('r1', kimiPlanRequest(), 'call_x', null, 'plan', noop)
    const reply = (approved: boolean) =>
      replyOf(held, { kind: 'plan', approved, acceptEdits: approved, feedback: '' })

    expect(reply(true)).toEqual({ outcome: { outcome: 'selected', optionId: 'plan_approve' } })
    expect(reply(false)).toEqual({ outcome: { outcome: 'selected', optionId: 'plan_revise' } })
  })

  it('план с несколькими подходами - выбор подхода вопросом', () => {
    const request: AcpPermissionRequest = {
      ...kimiPlanRequest(),
      options: [
        { optionId: 'plan_opt_0', name: 'Small change', kind: 'allow_once' },
        { optionId: 'plan_opt_1', name: 'Refactor', kind: 'allow_once' },
        { optionId: 'plan_revise', name: 'Revise', kind: 'reject_once' },
        { optionId: 'plan_reject_and_exit', name: 'Reject and Exit', kind: 'reject_once' },
      ],
    }
    const held = holdPermission('r1', request, 'call_x', null, 'plan', noop)
    const question = held.pending.kind === 'question' ? held.pending.questions[0] : undefined

    expect(held.source).toBe('choice')
    expect(question?.options.map((option) => option.label)).toEqual([
      'Small change',
      'Refactor',
      'Revise',
    ])
    expect(
      replyOf(held, { kind: 'question', answers: { [question?.question ?? '']: 'Refactor' } }),
    ).toEqual({ outcome: { outcome: 'selected', optionId: 'plan_opt_1' } })
  })
})

describe('форма вопросов', () => {
  it('Kimi: два вопроса строками сообщения - два разных вопроса и ответы по ключам', () => {
    const request: AcpElicitationRequest = {
      mode: 'form',
      message: 'Which color?\nWhich size?',
      requestedSchema: {
        properties: {
          q0: { type: 'string', title: 'Color', oneOf: [{ const: 'Red' }, { const: 'Blue' }] },
          q1: { type: 'string', title: 'Size', oneOf: [{ const: 'S' }, { const: 'L' }] },
        },
      },
    }
    const held = holdForm('r1', request, noop)
    const questions = held.pending.kind === 'question' ? held.pending.questions : []

    expect(questions.map((one) => one.question)).toEqual(['Which color?', 'Which size?'])
    expect(
      replyOf(held, { kind: 'question', answers: { 'Which color?': 'Blue', 'Which size?': 'L' } }),
    ).toEqual({ action: 'accept', content: { q0: 'Blue', q1: 'L' } })
  })

  it('множественный выбор узнаёт вариант с запятой в подписи', () => {
    const request: AcpElicitationRequest = {
      mode: 'form',
      message: 'Pick ways?',
      requestedSchema: {
        properties: {
          ways: {
            type: 'array',
            title: 'Pick ways?',
            items: { anyOf: [{ const: 'fast', title: 'Fast, but risky' }, { const: 'safe' }] },
          },
        },
      },
    }
    const held = holdForm('r1', request, noop)

    expect(
      replyOf(held, { kind: 'question', answers: { 'Pick ways?': 'Fast, but risky, safe' } }),
    ).toEqual({ action: 'accept', content: { ways: ['fast', 'safe'] } })
  })
})
