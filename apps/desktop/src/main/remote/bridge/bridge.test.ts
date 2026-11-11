import { it, expect, describe, afterEach } from 'vitest'

import type { ConversationOptions } from '@shared/claude'

import { settle, bridgeSetup, OTHER_PHONE, stopBridges } from '../__fixtures__/fake-bridge'
import {
  RUN,
  itemOf,
  PROJECT_PATH,
  conversationOf,
  CONVERSATION_ID,
} from '../__fixtures__/fake-ide'
import { openProjectKey } from './project-keys'

afterEach(stopBridges)

describe('инвентарь', () => {
  it('проекты ключами, разговоры с провайдером, очереди коротко - и ни одного пути', async () => {
    const { say, next } = bridgeSetup()

    say({ k: 'hello' })

    const inventory = await next('inventory')
    const [open, recent] = inventory.projects

    expect(JSON.stringify(inventory)).not.toContain('/Users/')
    expect(open).toMatchObject({
      key: openProjectKey(PROJECT_PATH),
      name: 'secret-client',
      open: true,
    })
    expect(open?.conversations).toEqual([
      {
        id: CONVERSATION_ID,
        provider: 'claude',
        title: 'Fix the login bug',
        status: 'idle',
        since: 1000,
        waiting: null,
      },
    ])
    expect(open?.queues).toEqual({ open: 1, running: 1, asking: 1 })
    expect(recent).toMatchObject({ open: false, conversations: [] })
    expect(recent?.key.startsWith('r-')).toBe(true)
    expect(inventory.providers[0]).toMatchObject({
      id: 'claude',
      permissionModes: ['default', 'acceptEdits', 'plan'],
    })
    expect(inventory.machine).toEqual({ label: 'Agentic Workstation on test', ideVersion: '0.1.0' })
  })

  it('перемена состояния разговора - новый список каждому на связи, без перемен - тишина', async () => {
    const { ide, sentTo, bridge, say, next } = bridgeSetup()

    say({ k: 'inventory' })
    await next('inventory')

    const before = sentTo().length

    bridge.claudeChanged(ide.state)
    await settle(400)
    expect(sentTo().length).toBe(before)

    ide.state.conversations = [conversationOf({ status: 'running', workStartedAt: 5000 })]
    bridge.claudeChanged(ide.state)

    const changed = await next('inventory', before)

    expect(changed.projects[0]?.conversations[0]).toMatchObject({ status: 'running', since: 5000 })
  })

  it('отпечаток списка - у каждого телефона свой, провайдеры известны до первого hello', async () => {
    const { ide, sentTo, bridge, say, next } = bridgeSetup()

    // Первый телефон получил список; второй его не видел - перемена уйдёт обоим, второму тоже.
    say({ k: 'hello' })
    await next('inventory')
    ide.state.conversations = [conversationOf({ status: 'running', workStartedAt: 5000 })]
    bridge.claudeChanged(ide.state)

    const other = await next('inventory', 0, OTHER_PHONE)

    expect(other.providers.map((provider) => provider.id)).toEqual(['claude'])
    await next('inventory', 1)

    // Без перемен - больше никому ничего.
    const counts = [sentTo().length, sentTo(OTHER_PHONE).length]

    bridge.claudeChanged(ide.state)
    await settle(400)
    expect([sentTo().length, sentTo(OTHER_PHONE).length]).toEqual(counts)
  })
})

describe('лента разговора', () => {
  it('снимок, сложенные заплатки с номерами и догонка по номеру', async () => {
    const { ide, sentTo, bridge, say, next } = bridgeSetup()

    say({ k: 'subscribe', conversationId: CONVERSATION_ID })

    const state = await next('conversation')
    const snapshot = await next('feed')

    expect(state.conversation).toMatchObject({
      id: CONVERSATION_ID,
      projectKey: openProjectKey(PROJECT_PATH),
    })
    expect(JSON.stringify(state)).not.toContain('/Users/')
    expect(snapshot).toMatchObject({ seq: 0, epoch: 'epoch-1', hasEarlier: false })
    expect(snapshot.items.map((item) => item.id)).toEqual(['u1', 'a1'])

    // Поток модели: три заплатки за миг - один кадр с последним текстом.
    for (const text of ['He', 'Hell', 'Hello!']) {
      bridge.feedPatched({ conversationId: CONVERSATION_ID, upserts: [itemOf('a2', text)] })
    }

    const patch = await next('patch')

    expect(patch.seq).toBe(1)
    expect(patch.upserts).toEqual([itemOf('a2', 'Hello!')])

    // Вернулся с номером 0 той же жизни - только заплатки, без снимка.
    const mark = sentTo().length

    say({ k: 'subscribe', conversationId: CONVERSATION_ID, since: 0, epoch: 'epoch-1' })
    expect((await next('patch', mark)).seq).toBe(1)
    expect(
      sentTo()
        .slice(mark)
        .some((message) => message.k === 'feed'),
    ).toBe(false)

    // Номер из прошлой жизни IDE - снимок.
    say({ k: 'subscribe', conversationId: CONVERSATION_ID, since: 1, epoch: 'old' })
    expect((await next('feed', mark)).seq).toBe(1)

    // Вкладку закрыли - телефону сказано, подписка снята.
    ide.state.conversations = []
    bridge.claudeChanged(ide.state)
    expect((await next('conversationGone')).conversationId).toBe(CONVERSATION_ID)
  })

  it('ленту, которую никто не смотрел, телефоны не получают', async () => {
    const { log, bridge } = bridgeSetup()

    bridge.feedPatched({ conversationId: CONVERSATION_ID, upserts: [itemOf('x', 'y')] })
    await settle(200)
    expect(log).toEqual([])
  })
})

describe('команды телефона', () => {
  it('разговор: сообщение, ответ без «всегда», остановка, имя, модель', async () => {
    const { ide, command } = bridgeSetup()

    expect(
      await command('conversation.send', { conversationId: CONVERSATION_ID, text: 'go' }),
    ).toMatchObject({ ok: true })
    expect(ide.calls.at(-1)).toEqual({
      name: 'send',
      args: [CONVERSATION_ID, { text: 'go', images: [] }],
    })

    await command('conversation.respond', {
      conversationId: CONVERSATION_ID,
      requestId: 'r1',
      decision: { kind: 'permission', allow: true },
    })
    expect(ide.calls.at(-1)?.args[2]).toEqual({
      kind: 'permission',
      decision: { behavior: 'allow' },
    })

    await command('conversation.respond', {
      conversationId: CONVERSATION_ID,
      requestId: 'r2',
      decision: { kind: 'plan', approve: true },
    })
    expect(ide.calls.at(-1)?.args[2]).toEqual({
      kind: 'plan',
      approved: true,
      acceptEdits: false,
      feedback: '',
    })

    expect(
      await command('conversation.respond', {
        conversationId: CONVERSATION_ID,
        requestId: 'r3',
        decision: { kind: 'permission', behavior: 'allowAlways' },
      }),
    ).toMatchObject({ ok: false, code: 'badArgs' })

    await command('conversation.interrupt', { conversationId: CONVERSATION_ID })
    await command('conversation.rename', { conversationId: CONVERSATION_ID, title: 'New name' })
    await command('conversation.setEffort', { conversationId: CONVERSATION_ID, effort: 'low' })
    expect(ide.calls.slice(-3).map((call) => call.name)).toEqual([
      'interrupt',
      'rename',
      'setOptions',
    ])
    expect(await command('conversation.send', { conversationId: 'nope', text: 'x' })).toMatchObject(
      { ok: false, code: 'notFound' },
    )
  })

  it('итог команды уходит срочной очередью', async () => {
    const { log, command } = bridgeSetup()

    await command('conversation.interrupt', { conversationId: CONVERSATION_ID })

    expect(log.find((entry) => entry.message.k === 'result')?.lane).toBe('urgent')
  })

  it('новый разговор - в открытом проекте по ключу, с моделью и режимом, id от IDE', async () => {
    const { ide, command } = bridgeSetup()
    const result = await command('conversation.new', {
      projectKey: openProjectKey(PROJECT_PATH),
      provider: 'claude',
      model: 'haiku',
      permissionMode: 'plan',
    })

    expect(result).toMatchObject({ ok: true, data: { conversationId: 'new-1' } })
    expect(ide.calls).toEqual([
      { name: 'newConversation', args: [PROJECT_PATH, { model: 'haiku', permissionMode: 'plan' }] },
    ])
    expect(
      await command('conversation.new', { projectKey: `p-${'Z'.repeat(22)}`, provider: 'claude' }),
    ).toMatchObject({ ok: false, code: 'notFound' })
  })

  it('новый разговор без режима - default, а не режим из настроек или соседней вкладки', async () => {
    const { ide, command } = bridgeSetup()

    await command('conversation.new', {
      projectKey: openProjectKey(PROJECT_PATH),
      provider: 'claude',
    })

    expect(ide.calls[0]?.args[1]).toEqual({ permissionMode: 'default' })
    expect(ide.state.conversations.at(-1)?.permissionMode).toBe('default')
  })

  it('разговор вышел не в телефонном режиме - отказ, и он закрыт', async () => {
    const { ide, command } = bridgeSetup()

    // IDE, которая не послушала выбор: вкладка унаследовала bypass.
    ide.ports.conversations.newConversation = (projectPath, options: ConversationOptions) => {
      ide.calls.push({ name: 'newConversation', args: [projectPath, options] })
      ide.state.conversations = [
        ...ide.state.conversations,
        conversationOf({ id: 'new-1', permissionMode: 'bypassPermissions' }),
      ]

      return Promise.resolve('new-1')
    }

    expect(
      await command('conversation.new', {
        projectKey: openProjectKey(PROJECT_PATH),
        provider: 'claude',
      }),
    ).toMatchObject({ ok: false, code: 'refused', detail: 'permissionMode' })
    expect(ide.calls.at(-1)).toEqual({ name: 'close', args: ['new-1'] })
    expect(ide.state.conversations.some((one) => one.id === 'new-1')).toBe(false)
  })

  it('сценарии: полки, запуск, очередь, прогон; закрыть очередь нельзя, незнакомое - отказ', async () => {
    const { ide, command } = bridgeSetup()
    const key = openProjectKey(PROJECT_PATH)
    const shelves = await command('scenarios.shelves', { projectKey: key })

    expect(shelves).toMatchObject({
      ok: true,
      data: { scenarios: [{ id: 'tidy', name: 'Tidy up' }] },
    })

    const started = await command('scenarios.start', {
      projectKey: key,
      scenarioId: 'tidy',
      scope: 'project',
      inputs: { what: 'docs' },
      provider: 'claude',
      target: { kind: 'new', worktree: true },
      afterSuccess: false,
    })

    expect(started).toMatchObject({ ok: true, data: { queueId: 'q2', itemId: 'i2' } })
    expect(ide.calls.at(-1)?.args[0]).toMatchObject({
      projectPath: PROJECT_PATH,
      target: { kind: 'new', worktree: true },
    })

    await command('scenarios.queue', { queueId: 'q1', action: { kind: 'stopAfter', itemId: 'i1' } })
    await command('scenarios.control', { runId: 'r1', action: 'pause' })
    await command('scenarios.answer', { runId: 'r1', allow: true, text: 'yes' })
    expect(ide.calls.slice(-3)).toEqual([
      { name: 'scenarios.act', args: ['q1', { kind: 'stopAfter', itemId: 'i1' }] },
      { name: 'scenarios.control', args: [PROJECT_PATH, 'r1', 'pause'] },
      { name: 'scenarios.answer', args: [PROJECT_PATH, 'r1', true, 'yes'] },
    ])

    expect(
      await command('scenarios.queue', { queueId: 'q1', action: { kind: 'close' } }),
    ).toMatchObject({ ok: false, code: 'badArgs' })
    expect(await command('terminal.run', { command: 'ls' })).toMatchObject({
      ok: false,
      code: 'unknownCommand',
    })
  })
})

describe('сценарии на телефоне', () => {
  it('очереди проекта и прогон - без папок worktree и проекта', async () => {
    const { bridge, sentTo, say, next } = bridgeSetup()

    say({ k: 'subscribe', projectKey: '*' })

    const queues = await next('queues')

    expect(queues.queues[0]).toMatchObject({
      id: 'q1',
      workdir: { kind: 'worktree', gitBranch: 'scenarios/cleanup' },
    })
    expect(queues.live[0]).toMatchObject({ id: 'r1', asking: 'Delete old files?' })
    expect(JSON.stringify(queues)).not.toContain('/Users/')

    say({ k: 'subscribe', runId: 'r1' })

    const run = await next('run')

    expect(run.run).toMatchObject({
      id: 'r1',
      question: { title: 'Delete old files?' },
      stages: [{ title: 'Look around' }],
    })
    expect(JSON.stringify(run)).not.toContain('/Users/')

    say({ k: 'subscribe', runId: 'gone' })
    expect(await next('notice')).toMatchObject({ code: 'notFound', about: 'gone' })

    const mark = sentTo().length

    bridge.runChanged({ ...RUN, state: 'paused' })
    expect((await next('run', mark)).run.state).toBe('paused')
  })
})
