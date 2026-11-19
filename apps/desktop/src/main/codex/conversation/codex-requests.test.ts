import { it, expect, describe } from 'vitest'

import { policyFor } from './codex-modes'
import { answerFor, holdServerRequest } from './codex-requests'

const facts = () => ({
  name: 'apply_patch',
  input: { path: '/p/a.ts' },
  action: { kind: 'edit' as const, path: '/p/a.ts', preview: [] },
})

describe('режимы Codex', () => {
  it('спрашивать, правки, план, без вопросов - политика и песочница', () => {
    expect(policyFor('default')).toMatchObject({
      approvalPolicy: 'untrusted',
      sandbox: 'workspace-write',
      plan: false,
    })
    expect(policyFor('acceptEdits')).toMatchObject({
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
    })
    expect(policyFor('plan')).toMatchObject({
      approvalPolicy: 'on-request',
      sandbox: 'read-only',
      plan: true,
    })
    expect(policyFor('bypassPermissions')).toMatchObject({
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'dangerFullAccess' },
    })
  })
})

describe('вопросы сервера Codex', () => {
  it('команда - вопрос разрешения с командой; ответы - accept, acceptForSession, decline', () => {
    const held = holdServerRequest(
      7,
      'item/commandExecution/requestApproval',
      { itemId: 'c1', command: 'rm -rf build', reason: 'cleanup' },
      'codex-1-7',
      'default',
      facts,
    )

    expect(held?.pending).toMatchObject({
      kind: 'permission',
      requestId: 'codex-1-7',
      toolUseId: 'c1',
      action: { kind: 'command', command: 'rm -rf build' },
      reason: 'cleanup',
    })
    if (!held) throw new Error('not held')
    expect(answerFor(held, { kind: 'permission', decision: { behavior: 'allow' } })).toEqual({
      decision: 'accept',
    })
    expect(answerFor(held, { kind: 'permission', decision: { behavior: 'allowAlways' } })).toEqual({
      decision: 'acceptForSession',
    })
    expect(
      answerFor(held, { kind: 'permission', decision: { behavior: 'deny', message: 'no' } }),
    ).toEqual({
      decision: 'decline',
    })
  })

  it('правка - вид действия из ленты по itemId', () => {
    const held = holdServerRequest(
      8,
      'item/fileChange/requestApproval',
      { itemId: 'f1' },
      'codex-1-8',
      'default',
      facts,
    )

    expect(held?.pending).toMatchObject({
      kind: 'permission',
      action: { kind: 'edit', path: '/p/a.ts' },
    })
  })

  it('вопрос с вариантами - ответ по id вопроса', () => {
    const held = holdServerRequest(
      9,
      'item/tool/requestUserInput',
      {
        itemId: 'q1',
        questions: [
          {
            id: 'db',
            header: 'DB',
            question: 'Which database?',
            options: [{ label: 'Postgres', description: '' }],
          },
        ],
      },
      'codex-1-9',
      'default',
      facts,
    )

    expect(held?.pending).toMatchObject({
      kind: 'question',
      questions: [{ question: 'Which database?', header: 'DB', options: [{ label: 'Postgres' }] }],
    })
    if (!held) throw new Error('not held')
    expect(
      answerFor(held, { kind: 'question', answers: { 'Which database?': 'Postgres' } }),
    ).toEqual({
      answers: { db: { answers: ['Postgres'] } },
    })
  })

  it('вопрос без вариантов и секретный - свой ответ, с запятой - одним ответом', () => {
    const held = holdServerRequest(
      10,
      'item/tool/requestUserInput',
      {
        itemId: 'q2',
        questions: [
          {
            id: 'key',
            header: '',
            question: 'API key?',
            isOther: false,
            isSecret: true,
            options: null,
          },
          {
            id: 'env',
            header: '',
            question: 'Where?',
            isOther: false,
            isSecret: false,
            options: [{ label: 'prod', description: '' }],
          },
        ],
      },
      'codex-1-10',
      'default',
      facts,
    )

    expect(held?.pending).toMatchObject({
      kind: 'question',
      questions: [
        { question: 'API key?', options: [], other: true, secret: true },
        { question: 'Where?', other: false, secret: false },
      ],
    })
    if (!held) throw new Error('not held')
    expect(
      answerFor(held, { kind: 'question', answers: { 'API key?': 'a, b', 'Where?': 'prod' } }),
    ).toEqual({ answers: { key: { answers: ['a, b'] }, env: { answers: ['prod'] } } })
  })

  it('незнакомый вопрос - null: Codex получит отказ сразу', () => {
    expect(holdServerRequest(1, 'item/tool/call', {}, 'x', 'default', facts)).toBeNull()
  })
})
