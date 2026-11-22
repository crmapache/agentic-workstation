import { it, expect, describe, afterEach } from 'vitest'

import type { PendingRequest, ConversationOptions } from '@shared/conversation'

import { settle, bridgeSetup, OTHER_PHONE, stopBridges } from '../__fixtures__/fake-bridge'
import {
  RUN,
  itemOf,
  PERMISSION,
  PROJECT_PATH,
  conversationOf,
  CONVERSATION_ID,
} from '../__fixtures__/fake-ide'
import { projectKey } from './project-keys'

afterEach(stopBridges)

describe('инвентарь', () => {
  it('проекты ключами, разговоры с провайдером, очереди коротко - и ни одного пути', async () => {
    const { say, next } = bridgeSetup()

    say({ k: 'hello' })

    const inventory = await next('inventory')
    const [open, recent] = inventory.projects

    expect(JSON.stringify(inventory)).not.toContain('/Users/')
    expect(open).toMatchObject({
      key: projectKey(PROJECT_PATH),
      name: 'secret-client',
      open: true,
    })
    expect(open?.conversations).toEqual([
      {
        id: CONVERSATION_ID,
        provider: 'claude',
        title: 'Fix the login bug',
        status: 'idle',
        outcome: 'done',
        since: 1000,
        waiting: null,
      },
    ])
    // Прогон с вопросом идёт, но сам не работает: знак работы на телефоне не горит.
    expect(open?.queues).toEqual({ open: 1, running: 1, asking: 1, working: 0 })
    // Задания: работает только идущий прогон, ждущий ответа - нет.
    expect(open?.tasks).toEqual({ working: 1 })
    // Новый разговор открытого проекта - во всех режимах окна: bypass здесь не запрещён.
    expect(open?.unavailableModes).toEqual({ claude: [] })
    expect(recent).toMatchObject({ open: false, conversations: [] })
    expect(recent?.unavailableModes).toBeUndefined()
    // Ключ один и для открытого, и для закрытого: открыт ли - говорит open.
    expect(recent?.key).toMatch(/^p-[A-Za-z0-9_-]{22}$/)
    expect(inventory.providers[0]).toMatchObject({
      id: 'claude',
      permissionModes: ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'],
    })
    expect(inventory.machine).toEqual({ label: 'Agentic Workstation on test', ideVersion: '0.1.0' })
  })

  it('пустая вкладка «New chat» - с пометкой blank, начатый разговор и форк - без неё', async () => {
    const { ide, say, next } = bridgeSetup()
    const blank = {
      title: '',
      outcome: 'none' as const,
      usage: { contextTokens: 0, contextWindow: 0 },
    }

    ide.state.conversations = [
      conversationOf({ id: 'empty', ...blank }),
      // Первое сообщение из одной картинки имени не даёт - начат по итогу хода.
      conversationOf({ id: 'picture', ...blank, outcome: 'done' }),
      conversationOf({ id: 'asking', ...blank, status: 'running' }),
      conversationOf({
        id: 'fork',
        ...blank,
        fork: { sourceSessionId: 's', sourceTitle: 'Login bug', at: 'u1' },
      }),
    ]
    say({ k: 'hello' })

    const conversations = (await next('inventory')).projects[0]?.conversations ?? []

    expect(conversations.map((one) => [one.id, one.title, one.blank])).toEqual([
      ['empty', 'New chat', true],
      ['picture', 'New chat', undefined],
      ['asking', 'New chat', undefined],
      ['fork', 'Login bug', undefined],
    ])
  })

  it('перемена состояния разговора - новый список каждому на связи, без перемен - тишина', async () => {
    const { ide, sentTo, bridge, say, next } = bridgeSetup()

    say({ k: 'inventory' })
    await next('inventory')

    const before = sentTo().length

    bridge.panelChanged()
    await settle(400)
    expect(sentTo().length).toBe(before)

    ide.state.conversations = [conversationOf({ status: 'running', workStartedAt: 5000 })]
    bridge.panelChanged()

    const changed = await next('inventory', before)

    expect(changed.projects[0]?.conversations[0]).toMatchObject({ status: 'running', since: 5000 })
  })

  it('отпечаток списка - у каждого телефона свой, провайдеры известны до первого hello', async () => {
    const { ide, sentTo, bridge, say, next } = bridgeSetup()

    // Первый телефон получил список; второй его не видел - перемена уйдёт обоим, второму тоже.
    say({ k: 'hello' })
    await next('inventory')
    ide.state.conversations = [conversationOf({ status: 'running', workStartedAt: 5000 })]
    bridge.panelChanged()

    const other = await next('inventory', 0, OTHER_PHONE)

    expect(other.providers.map((provider) => provider.id)).toEqual(['claude'])
    await next('inventory', 1)

    // Без перемен - больше никому ничего.
    const counts = [sentTo().length, sentTo(OTHER_PHONE).length]

    bridge.panelChanged()
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
      projectKey: projectKey(PROJECT_PATH),
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
    bridge.panelChanged()
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

    const ask = (pending: PendingRequest) => {
      ide.state.conversations = [conversationOf({ pending, status: 'waiting', pendingCount: 1 })]
    }

    ask({ ...PERMISSION, requestId: 'r1' })
    await command('conversation.respond', {
      conversationId: CONVERSATION_ID,
      requestId: 'r1',
      decision: { kind: 'permission', allow: true },
    })
    expect(ide.calls.at(-1)?.args[2]).toEqual({
      kind: 'permission',
      decision: { behavior: 'allow' },
    })

    ask({ kind: 'plan', requestId: 'r2', toolUseId: 't2', plan: 'Do it' })
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

    // Ответ на вопрос, которого уже нет (ответили за столом, стоит следующий), - отказ, а не «ок».
    const answered = ide.calls.length

    ask({ ...PERMISSION, requestId: 'r4' })
    expect(
      await command('conversation.respond', {
        conversationId: CONVERSATION_ID,
        requestId: 'r1',
        decision: { kind: 'permission', allow: true },
      }),
    ).toMatchObject({ ok: false, code: 'questionGone' })
    // Тот же вопрос, ответ не того вида - не ответ.
    expect(
      await command('conversation.respond', {
        conversationId: CONVERSATION_ID,
        requestId: 'r4',
        decision: { kind: 'plan', approve: true },
      }),
    ).toMatchObject({ ok: false, code: 'badArgs' })
    expect(ide.calls).toHaveLength(answered)

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
      projectKey: projectKey(PROJECT_PATH),
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

  /** IDE, у которой новая вкладка берёт bypass сама (закреплён в Settings → New chats). */
  const inheritingBypass = (ide: ReturnType<typeof bridgeSetup>['ide']) => {
    ide.claude.newConversation = (projectPath, options: ConversationOptions) => {
      ide.calls.push({ name: 'newConversation', args: [projectPath, options] })
      ide.state.conversations = [
        ...ide.state.conversations,
        conversationOf({ id: 'new-1', permissionMode: 'bypassPermissions', ...options }),
      ]

      return Promise.resolve('new-1')
    }
  }

  it('новый разговор без режима - режим новой вкладки окна этого провайдера', async () => {
    const { ide, command } = bridgeSetup()
    const asInIde = { projectKey: projectKey(PROJECT_PATH), provider: 'claude' }

    inheritingBypass(ide)

    expect(await command('conversation.new', asInIde)).toMatchObject({ ok: true })
    expect(ide.calls[0]?.args[1]).toEqual({})
    expect(ide.state.conversations.at(-1)?.permissionMode).toBe('bypassPermissions')

    // Режим окна, который настройки сейчас запрещают, - отказ, и вкладка закрыта.
    ide.settings.bypassDisabled = true
    expect(await command('conversation.new', asInIde)).toMatchObject({
      ok: false,
      code: 'refused',
      detail: 'modeUnavailable',
    })
    expect(ide.calls.at(-1)).toEqual({ name: 'close', args: ['new-1'] })
  })

  it('разговор вышел не в выбранном режиме - отказ permissionMode, и он закрыт', async () => {
    const { ide, command } = bridgeSetup()

    // IDE, которая не послушала выбор: вкладка унаследовала bypass.
    ide.claude.newConversation = (projectPath, options: ConversationOptions) => {
      ide.calls.push({ name: 'newConversation', args: [projectPath, options] })
      ide.state.conversations = [
        ...ide.state.conversations,
        conversationOf({ id: 'new-1', permissionMode: 'bypassPermissions' }),
      ]

      return Promise.resolve('new-1')
    }

    expect(
      await command('conversation.new', {
        projectKey: projectKey(PROJECT_PATH),
        provider: 'claude',
        permissionMode: 'default',
      }),
    ).toMatchObject({ ok: false, code: 'refused', detail: 'permissionMode' })
    expect(ide.calls.at(-1)).toEqual({ name: 'close', args: ['new-1'] })
    expect(ide.state.conversations.some((one) => one.id === 'new-1')).toBe(false)
  })

  it('сценарии: полки, запуск, очередь, прогон; закрыть очередь нельзя, незнакомое - отказ', async () => {
    const { ide, command } = bridgeSetup()
    const key = projectKey(PROJECT_PATH)
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
    })

    expect(started).toMatchObject({ ok: true, data: { queueId: 'q2', itemId: 'i2' } })
    expect(ide.calls.at(-1)?.args[0]).toMatchObject({
      projectPath: PROJECT_PATH,
      target: { kind: 'new', worktree: true },
    })

    const asked = { stepKey: 's1:c1:1', askedAt: 30 }

    await command('scenarios.queue', { queueId: 'q1', action: { kind: 'stopAfter', itemId: 'i1' } })
    await command('scenarios.control', { runId: 'r1', action: 'pause', seen: 'running' })
    await command('scenarios.answer', { runId: 'r1', question: asked, allow: true, text: 'yes' })
    expect(ide.calls.slice(-3)).toEqual([
      { name: 'scenarios.act', args: ['q1', { kind: 'stopAfter', itemId: 'i1' }] },
      { name: 'scenarios.control', args: [PROJECT_PATH, 'r1', 'pause'] },
      { name: 'scenarios.answer', args: [PROJECT_PATH, 'r1', true, 'yes'] },
    ])

    // Устаревший экран: вопрос уже другой, кнопка нарисована для паузы, а прогон идёт.
    const before = ide.calls.length

    expect(
      await command('scenarios.answer', {
        runId: 'r1',
        question: { ...asked, askedAt: 29 },
        allow: true,
        text: 'yes',
      }),
    ).toMatchObject({ ok: false, code: 'questionGone' })
    expect(
      await command('scenarios.control', { runId: 'r1', action: 'resume', seen: 'paused' }),
    ).toMatchObject({ ok: false, code: 'runMoved' })
    expect(ide.calls).toHaveLength(before)

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
