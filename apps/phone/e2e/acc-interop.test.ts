import { it, expect, describe, afterEach } from 'vitest'

import type { AccountsWire } from '@agentic-workstation/remote-protocol/machine-wire-types'
import type { ConversationWire } from '@agentic-workstation/remote-protocol/wire-types'

import { MESSAGE_UUID } from '../../desktop/src/main/remote/__fixtures__/fake-extras'
import { CONVERSATION_ID } from '../../desktop/src/main/remote/__fixtures__/fake-ide'
import { until } from './ide-harness'
import { lastOf, harness, pairPhone, runCleanups } from './interop-phone'

/**
 * Команды телефона уровня ACC - ядром телефона (WebCrypto, WebSocket) через настоящий релей к
 * настоящему RemoteService: очередь разговора, вопрос сбоку, откат, поиск, аккаунты, недавний
 * проект, полки сценариев, журнал шага, расписание и черновик ИИ. Папок машины и почты целиком
 * на проводе нет.
 */

afterEach(runCleanups)

const conversationId = CONVERSATION_ID

const lastConversation = (messages: { k: string }[]) =>
  (
    messages.findLast((message) => message.k === 'conversation') as
      { conversation: ConversationWire } | undefined
  )?.conversation

describe('команды уровня ACC через настоящую IDE', () => {
  it('очередь разговора: отложить, переставить, отправить сейчас - и зеркало видит перемены', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)
    const agentId = code.agentId

    await until(() => lastOf(inbox, 'inventory'), 'inventory')
    client.watch(agentId, { kind: 'conversation', conversationId })
    await until(() => lastConversation(inbox.messages), 'conversation')

    for (const text of ['first', 'second']) {
      expect(
        await client.command(agentId, 'conversation.enqueue', { conversationId, text }),
      ).toEqual({ ok: true })
    }

    const queued = await until(
      () =>
        lastConversation(inbox.messages)?.queue.length === 2
          ? lastConversation(inbox.messages)
          : null,
      'two queued messages',
    )
    const second = queued.queue[1]?.id ?? ''

    expect(
      await client.command(agentId, 'conversation.moveQueued', {
        conversationId,
        queuedId: second,
        toIndex: 0,
      }),
    ).toEqual({ ok: true })
    await until(
      () => lastConversation(inbox.messages)?.queue[0]?.text === 'second',
      'reordered queue',
    )
    expect(
      await client.command(agentId, 'conversation.sendQueued', {
        conversationId,
        queuedId: second,
      }),
    ).toEqual({ ok: true })
    await until(() => lastConversation(inbox.messages)?.queue.length === 1, 'sent from the queue')
  })

  it('вопрос сбоку, откат и поиск - ответы без папок, места слов на месте', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)
    const agentId = code.agentId
    const inventory = await until(() => lastOf(inbox, 'inventory'), 'inventory')
    const projectKey = inventory.projects[0]?.key ?? ''
    const aside = await client.command(agentId, 'conversation.aside', {
      conversationId,
      askId: 'phone-a1',
      question: 'What are you on?',
    })

    expect(aside).toMatchObject({
      ok: true,
      data: { askId: 'phone-a1', state: 'answered', text: 'Working in {project}/src on it.' },
    })

    const preview = await client.command(agentId, 'conversation.rewindPreview', {
      conversationId,
      messageId: MESSAGE_UUID,
    })

    expect(preview).toMatchObject({ ok: true, data: { state: 'ready', count: 2 } })
    expect(JSON.stringify(preview)).not.toContain('/Users/')

    const found = await client.command(agentId, 'conversation.search', {
      projectKey,
      query: 'login',
    })
    const hit = (found as { data: { hits: { snippet: string; spans: [number, number][] }[] } }).data
      .hits[0]

    expect(hit?.spans.map(([from, to]) => hit.snippet.slice(from, to))).toEqual(['login'])
    expect(JSON.stringify(found)).not.toContain('/Users/')
  })

  it('машина: почта замаскирована, выбор аккаунта, недавний проект открывается и виден открытым', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)
    const agentId = code.agentId
    const inventory = await until(() => lastOf(inbox, 'inventory'), 'inventory')
    const accounts = await client.command(agentId, 'accounts.list', {})

    expect(JSON.stringify(accounts)).not.toContain('mzpizote@')
    expect((accounts as { data: AccountsWire }).data.accounts[0]?.email).toBe('mz…e@gmail.com')
    expect(
      await client.command(agentId, 'accounts.use', { accountId: '0123456789abcdef' }),
    ).toMatchObject({ ok: true, data: { accounts: [{ current: false }, { current: true }, {}] } })

    const connectors = await client.command(agentId, 'connectors.list', {})

    expect(JSON.stringify(connectors)).not.toMatch(/sk-secret|\/Users\//)

    const recent = inventory.projects.find((project) => !project.open)

    expect(
      await client.command(agentId, 'projects.open', { projectKey: recent?.key ?? '' }),
    ).toEqual({ ok: true })
    await until(
      () =>
        inbox.messages.some(
          (message) =>
            message.k === 'inventory' &&
            message.projects.some((project) => project.key === recent?.key && project.open),
        ),
      'the recent project open in the inventory',
    )
  })

  it('сценарии: полки с историей, сценарий целиком, журнал головы страницами, час и черновик', async () => {
    const ide = await harness()
    const { client, inbox, code } = await pairPhone(ide)
    const agentId = code.agentId
    const inventory = await until(() => lastOf(inbox, 'inventory'), 'inventory')
    const projectKey = inventory.projects[0]?.key ?? ''
    const shelves = await client.command(agentId, 'scenarios.shelves', { projectKey })

    expect(shelves).toMatchObject({ ok: true, data: { runs: [{ id: 'r-old', starred: true }] } })

    const scenario = await client.command(agentId, 'scenarios.fetch', {
      projectKey,
      scenarioId: 'tidy',
      scope: 'project',
    })

    expect(scenario).toMatchObject({
      ok: true,
      data: { head: { briefing: 'Keep {project} tidy' } },
    })

    const tail = await client.command(agentId, 'scenarios.log', {
      projectKey,
      runId: 'r1',
      key: 'head',
    })
    const first = (tail as { data: { items: { id: string }[] } }).data.items[0]?.id ?? ''
    const above = await client.command(agentId, 'scenarios.log', {
      projectKey,
      runId: 'r1',
      key: 'head',
      before: first,
    })

    expect(above).toMatchObject({ ok: true, data: { found: true, hasEarlier: false } })

    expect(
      await client.command(agentId, 'scenarios.schedule', {
        projectKey,
        scenarioId: 'tidy',
        scope: 'project',
        scheduleId: '',
        at: 9 * 60,
        repeat: 'daily',
        weekday: 1,
        inputs: { what: 'src' },
        worktree: false,
        provider: 'claude',
      }),
    ).toEqual({ ok: true })

    const drafted = await client.command(agentId, 'scenarios.draft', {
      projectKey,
      draftId: 'phone-d1',
      description: 'Tidy the repo',
      scope: 'user',
    })

    expect(drafted).toMatchObject({ ok: true, data: { ok: true, scenario: { id: 'drafted' } } })
    expect(
      await client.command(agentId, 'scenarios.saveDraft', { projectKey, draftId: 'phone-d1' }),
    ).toMatchObject({ ok: true, data: { scenarioId: 'drafted', scope: 'user' } })
  })
})
