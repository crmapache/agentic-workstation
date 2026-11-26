import { it, expect, describe } from 'vitest'

import type { Conversation } from '@shared/conversation'
import type { ScenarioQueuesView } from '@shared/scenario-queues'
import type { ScenarioRun } from '@shared/scenario-runs'

import { parsePushNotice } from '@agentic-workstation/remote-protocol/push'

import {
  RUN,
  QUEUE,
  fakeIde,
  PERMISSION,
  PROJECT_PATH,
  conversationOf,
  CONVERSATION_ID,
} from '../__fixtures__/fake-ide'
import type { OwnedConversation } from '../bridge/panels'
import { ProjectKeys } from '../bridge/project-keys'
import { machineRoots, pathRedactor } from '../bridge/redact'
import type { AttentionInput } from './attention'
import { attentionId, attentionOf } from './attention'

const HOME = '/Users/someone'

/** Разговор панели Claude Code - так их и держит мост (panels.ts). */
const claude = (conversation: Conversation): OwnedConversation => ({
  provider: 'claude',
  conversation,
})

const inputOf = (over: Partial<AttentionInput> = {}): AttentionInput => {
  const ide = fakeIde()
  const workspace = ide.workspace
  const queues: ScenarioQueuesView = { queues: [QUEUE], live: [], folders: [] }

  return {
    conversations: [claude(conversationOf())],
    events: [],
    queues,
    runs: new Map(),
    keys: new ProjectKeys(workspace, [QUEUE.projectPath]),
    redact: pathRedactor(machineRoots(workspace, queues, HOME)),
    ...over,
  }
}

describe('поводы пуша из состояния IDE', () => {
  it('вопрос разрешения: имя проекта и разговора, инструмент, адрес экрана - без путей', () => {
    const [attention] = attentionOf(
      inputOf({
        conversations: [
          claude(
            conversationOf({
              pending: PERMISSION,
              title: `Fix ${PROJECT_PATH}/src/login.ts`,
            }),
          ),
        ],
      }),
    )

    expect(attention).toMatchObject({
      tag: `c-${CONVERSATION_ID}`,
      reason: 'permission',
      key: PERMISSION.requestId,
      since: null,
      notice: {
        provider: 'claude',
        project: 'secret-client',
        title: 'Fix {project}/src/login.ts',
        tool: 'Bash',
        route: { screen: 'conversation', conversationId: CONVERSATION_ID },
      },
    })
    expect(JSON.stringify(attention)).not.toContain('/Users/')
    expect(parsePushNotice({ p: 1, ...attention?.notice, at: 1 })).not.toBeNull()
  })

  it('вопрос и событие разговора Codex - пуш называет его провайдера', () => {
    const codex = conversationOf({ id: 'codex-1', pending: PERMISSION, title: 'Port the API' })
    const events = [{ conversationId: 'codex-1', reason: 'limit' as const, at: 300 }]
    const found = attentionOf(
      inputOf({
        conversations: [claude(conversationOf()), { provider: 'codex', conversation: codex }],
        events,
      }),
    )

    expect(found.map((one) => [one.tag, one.reason, one.notice.provider])).toEqual([
      ['c-codex-1', 'permission', 'codex'],
      ['c-codex-1', 'limit', 'codex'],
    ])
    expect(parsePushNotice({ p: 1, ...found[1]?.notice, at: 1 })).toMatchObject({
      provider: 'codex',
      route: { screen: 'conversation', conversationId: 'codex-1' },
    })
  })

  it('разговор закрытого проекта не будит; длинное имя режется', () => {
    const closed = conversationOf({ pending: PERMISSION, projectPath: '/Users/someone/elsewhere' })
    const long = conversationOf({ id: 'long-1', pending: PERMISSION, title: 'x'.repeat(300) })
    const found = attentionOf(inputOf({ conversations: [claude(closed), claude(long)] }))

    expect(found.map((one) => one.tag)).toEqual(['c-long-1'])
    expect(found[0]?.notice.title).toHaveLength(80)
    expect(found[0]?.notice.title.endsWith('…')).toBe(true)
  })

  it('события разговора живут до нового хода; лимит берёт срок из плана продолжения', () => {
    const events = [
      { conversationId: CONVERSATION_ID, reason: 'trouble' as const, at: 100 },
      { conversationId: CONVERSATION_ID, reason: 'limit' as const, at: 200 },
    ]
    const waiting = conversationOf({ carryOn: { until: 5000, guess: false } })
    const found = attentionOf(inputOf({ conversations: [claude(waiting)], events }))

    expect(found.map((one) => [one.reason, one.since, one.notice.until])).toEqual([
      ['trouble', 100, 0],
      ['limit', 200, 5000],
    ])

    // Человек написал снова - ход начался после события, звать не о чем.
    const moved = conversationOf({ turnStartedAt: 150 })

    expect(
      attentionOf(inputOf({ conversations: [claude(moved)], events })).map((one) => one.reason),
    ).toEqual(['limit'])
  })

  it('вопрос головы и лимит прогона - тегом его очереди и экраном прогона', () => {
    const run: ScenarioRun = { ...RUN }
    const summary = {
      ...RUN,
      done: 0,
      stageTitle: '',
      at: '',
      asking: '',
      roadmap: [],
      limit: { account: 'work', window: '5h', until: 9000, reason: '' },
    }
    const found = attentionOf(
      inputOf({
        conversations: [],
        runs: new Map([[run.id, run]]),
        queues: { queues: [QUEUE], live: [summary], folders: [] },
      }),
    )

    expect(found.map((one) => [one.tag, one.reason, one.key, one.notice.route.screen])).toEqual([
      ['q-q1', 'question', 's1:c1:1:30', 'run'],
      ['q-q1', 'limit', 'work:9000', 'run'],
    ])
    expect(found[0]?.since).toBe(30)
    expect(found[1]?.notice.until).toBe(9000)

    const finished = attentionOf(
      inputOf({ conversations: [], runs: new Map([[run.id, { ...run, state: 'done' }]]) }),
    )

    expect(finished).toEqual([])
  })

  it('очередь встала: после выбранного, провал, отказ - да; IDE закрыли посреди или закрыта - нет', () => {
    const held = (reason: 'stopAfter' | 'failed' | 'refused' | 'interrupted', closedAt = 0) =>
      attentionOf(
        inputOf({
          conversations: [],
          queues: {
            queues: [{ ...QUEUE, closedAt, hold: { reason, itemId: 'i1', at: 70 } }],
            live: [],
            folders: [],
          },
        }),
      )

    expect(held('failed')[0]).toMatchObject({
      tag: 'q-q1',
      reason: 'held',
      since: 70,
      notice: { detail: 'failed', title: 'Cleanup', route: { screen: 'queue', queueId: 'q1' } },
    })
    expect(held('stopAfter')).toHaveLength(1)
    expect(held('refused')).toHaveLength(1)
    expect(held('interrupted')).toEqual([])
    expect(held('failed', 5)).toEqual([])
    expect(attentionId(held('failed')[0]!)).toBe('q-q1|held|failed:i1:70')
  })
})
