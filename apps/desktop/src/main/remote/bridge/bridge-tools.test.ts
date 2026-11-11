import { it, expect, describe, afterEach } from 'vitest'

import type { PendingRequest } from '@shared/claude'

import type {
  SearchWire,
  AiSearchWire,
  AsideAnswerWire,
  RewindOutcomeWire,
  RewindPreviewWire,
} from '@agentic-workstation/remote-protocol/conversation-wire-types'

import { settle, bridgeSetup, stopBridges } from '../__fixtures__/fake-bridge'
import { MESSAGE_UUID } from '../__fixtures__/fake-extras'
import {
  PERMISSION,
  RECENT_PATH,
  PROJECT_PATH,
  conversationOf,
  CONVERSATION_ID,
} from '../__fixtures__/fake-ide'
import { redactSnippet } from './conversation-extras-wire'
import { projectKey } from './project-keys'

afterEach(stopBridges)

const conversationId = CONVERSATION_ID

const QUESTION: Extract<PendingRequest, { kind: 'question' }> = {
  kind: 'question',
  requestId: 'ask-1',
  toolUseId: 'tool-1',
  questions: [{ question: 'Which?', header: 'Pick', options: [], multiSelect: false }],
}

const callsOf = (ide: ReturnType<typeof bridgeSetup>['ide'], name: string) =>
  ide.calls.filter((call) => call.name === name).map((call) => call.args)

describe('очередь разговора с телефона', () => {
  it('отложить - с фото, убрать и отправить сейчас - только то, что стоит в очереди', async () => {
    const { ide, command } = bridgeSetup()
    const image = { mediaType: 'image/png' as const, data: 'AAAA' }

    expect(
      await command('conversation.enqueue', { conversationId, text: 'later', images: [image] }),
    ).toMatchObject({ ok: true })
    expect(callsOf(ide, 'enqueue')).toEqual([[conversationId, { text: 'later', images: [image] }]])

    const [queued] = ide.state.conversations[0]?.queue ?? []

    expect(
      await command('conversation.unqueue', { conversationId, queuedId: 'gone' }),
    ).toMatchObject({
      ok: false,
      code: 'notFound',
    })
    expect(
      await command('conversation.sendQueued', { conversationId, queuedId: queued?.id }),
    ).toMatchObject({ ok: true })
    expect(callsOf(ide, 'sendQueued')).toEqual([[conversationId, queued?.id]])
  })

  it('переставить отложенное - на место в очереди, чужое - notFound', async () => {
    const { ide, command } = bridgeSetup()

    await command('conversation.enqueue', { conversationId, text: 'first' })
    await command('conversation.enqueue', { conversationId, text: 'second' })

    const second = ide.state.conversations[0]?.queue[1]?.id ?? ''

    expect(
      await command('conversation.moveQueued', { conversationId, queuedId: second, toIndex: 0 }),
    ).toMatchObject({ ok: true })
    expect(ide.state.conversations[0]?.queue.map((queued) => queued.text)).toEqual([
      'second',
      'first',
    ])
    expect(
      await command('conversation.moveQueued', { conversationId, queuedId: 'nope', toIndex: 0 }),
    ).toMatchObject({ ok: false, code: 'notFound' })
  })

  it('состояние разговора несёт остановку, причину очереди, продолжение и быстрый режим', async () => {
    const { ide, say, next, bridge } = bridgeSetup()

    ide.state.conversations = [
      conversationOf({
        status: 'running',
        stopRequestedAt: 50,
        queueHold: 'paused',
        carryOn: { until: 9000, guess: true },
        fastMode: true,
        fastReport: { state: 'cooldown', reason: 'rate' },
      }),
    ]
    bridge.claudeChanged(ide.state)
    say({ k: 'subscribe', conversationId })

    const { conversation } = await next('conversation')

    expect(conversation).toMatchObject({
      stopRequestedAt: 50,
      queueHold: 'paused',
      carryOn: { until: 9000, guess: true },
      fast: { asked: true, state: 'cooldown' },
    })
  })
})

describe('остановки, продолжение и быстрый режим', () => {
  it("процесс, задача, «Don't continue» и быстрый режим - теми же действиями, что у окна", async () => {
    const { ide, command } = bridgeSetup()

    await command('conversation.forceStop', { conversationId })
    await command('conversation.stopTask', { conversationId, taskId: 'task_9' })
    await command('conversation.cancelCarryOn', { conversationId })
    await command('conversation.setFast', { conversationId, fast: true })

    expect(callsOf(ide, 'forceStop')).toEqual([[conversationId]])
    expect(callsOf(ide, 'stopTask')).toEqual([[conversationId, 'task_9']])
    expect(callsOf(ide, 'cancelCarryOn')).toEqual([[conversationId]])
    expect(callsOf(ide, 'setOptions')).toEqual([[conversationId, { fastMode: true }]])
  })

  it('закрыть можно только вопрос с вариантами, который стоит сейчас', async () => {
    const { ide, command } = bridgeSetup()

    expect(
      await command('conversation.dismiss', { conversationId, requestId: 'ask-1' }),
    ).toMatchObject({
      ok: false,
      code: 'questionGone',
    })

    ide.state.conversations = [conversationOf({ pending: PERMISSION, status: 'waiting' })]

    expect(
      await command('conversation.dismiss', { conversationId, requestId: PERMISSION.requestId }),
    ).toMatchObject({ ok: false, code: 'badArgs' })

    ide.state.conversations = [conversationOf({ pending: QUESTION, status: 'waiting' })]

    expect(
      await command('conversation.dismiss', { conversationId, requestId: 'ask-1' }),
    ).toMatchObject({
      ok: true,
    })
    expect(callsOf(ide, 'respond')).toEqual([
      [
        conversationId,
        'ask-1',
        { kind: 'permission', decision: { behavior: 'deny', message: '' } },
      ],
    ])
  })

  it('разговор закрытого проекта - notOpen и для новых команд', async () => {
    const { ide, command } = bridgeSetup()

    ide.state.conversations = [conversationOf({ projectPath: RECENT_PATH })]

    expect(await command('conversation.forceStop', { conversationId })).toMatchObject({
      ok: false,
      code: 'notOpen',
    })
    expect(ide.calls.some((call) => call.name === 'forceStop')).toBe(false)
  })
})

describe('вопрос сбоку и откат', () => {
  it('ответ сбоку - спросившему, без папок; занятый id - отказ; отмена кончает ожидание', async () => {
    const { ide, command, sentTo } = bridgeSetup()
    const answer = await command('conversation.aside', {
      conversationId,
      askId: 'a1',
      question: 'what now?',
    })
    const wire = (answer as { data: AsideAnswerWire }).data

    expect(wire).toMatchObject({ askId: 'a1', state: 'answered', truncated: false })
    expect(wire.text).toBe('Working in {project}/src on it.')
    expect(callsOf(ide, 'askAside')).toEqual([[conversationId, 'what now?', 'a1']])
    expect(
      await command('conversation.aside', { conversationId, askId: 'taken', question: 'again' }),
    ).toMatchObject({ ok: false, code: 'refused', detail: 'askTaken' })

    const waiting = command('conversation.aside', {
      conversationId,
      askId: 'a2',
      question: 'wait for it',
    })

    await settle()
    expect(sentTo().some((message) => message.k === 'result' && message.id === 'c3')).toBe(false)
    await command('conversation.asideCancel', { conversationId, askId: 'a2' })

    expect(((await waiting) as { data: AsideAnswerWire }).data.state).toBe('cancelled')
  })

  it('предпросмотр и итог отката - пути метками, текст отрезанного - для поля', async () => {
    const { ide, command } = bridgeSetup()
    const preview = await command('conversation.rewindPreview', {
      conversationId,
      messageId: MESSAGE_UUID,
    })

    expect((preview as { data: RewindPreviewWire }).data).toEqual({
      state: 'ready',
      files: ['{project}/src/login.ts', '~/notes.md'],
      count: 2,
      insertions: 4,
      deletions: 1,
    })

    const rewound = await command('conversation.rewind', {
      conversationId,
      messageId: MESSAGE_UUID,
      scope: 'both',
    })

    expect((rewound as { data: RewindOutcomeWire }).data).toEqual({
      rewound: true,
      prefill: 'Fix {project}/src/login.ts',
      filesFailed: null,
    })
    expect(callsOf(ide, 'rewind')).toEqual([[conversationId, MESSAGE_UUID, 'both']])
  })
})

describe('поиск по разговорам', () => {
  it('находки без папок, места слов пересчитаны после подмены', async () => {
    const { command } = bridgeSetup()
    const found = await command('conversation.search', {
      projectKey: projectKey(PROJECT_PATH),
      query: 'login',
    })
    const wire = (found as { data: SearchWire }).data
    const [hit] = wire.hits

    expect(JSON.stringify(wire)).not.toContain('/Users/')
    expect(wire).toMatchObject({ total: 1, conversations: 1, failed: false })
    expect(hit?.snippet).toBe('…opened {project}/src/login.ts and fixed login…')
    expect(hit?.spans.map(([start, end]) => hit.snippet.slice(start, end))).toEqual(['login'])
    expect(hit).not.toHaveProperty('text')
  })

  it('поиск модели - своим прогоном с приставкой, отмена - им же; закрытый проект - notOpen', async () => {
    const { ide, command } = bridgeSetup()
    const asked = await command('conversation.searchAi', {
      projectKey: projectKey(PROJECT_PATH),
      runId: 'run1',
      query: 'where did we fix login',
    })

    expect((asked as { data: AiSearchWire }).data).toMatchObject({
      status: 'found',
      hits: [{ reason: 'It edits {project}/src/login.ts' }],
    })
    expect(callsOf(ide, 'search.ask')[0]?.[1]).toBe('remote:run1')

    await command('conversation.searchCancel', { runId: 'run1' })

    expect(callsOf(ide, 'search.cancel')).toEqual([['remote:run1']])
    expect(
      await command('conversation.search', { projectKey: projectKey(RECENT_PATH), query: 'x' }),
    ).toMatchObject({ ok: false, code: 'notOpen' })
  })

  it('кусок находки: метка вместо пути, найденное слово внутри пути остаётся на месте', () => {
    const snippet = 'see /Users/a/proj/login.ts here'
    const start = snippet.indexOf('login')
    const redacted = redactSnippet(snippet, [[start, start + 5]], (text) =>
      text.replace('/Users/a/proj', '{project}'),
    )

    expect(redacted.snippet).toBe('see {project}/login.ts here')
    expect(redacted.spans.map(([from, to]) => redacted.snippet.slice(from, to))).toEqual(['login'])
  })
})
