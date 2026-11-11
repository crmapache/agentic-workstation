import { it, expect, describe, afterEach } from 'vitest'

import type { AgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import type { PhoneMessage } from '@agentic-workstation/remote-protocol/phone-messages'

import {
  RUN,
  itemOf,
  fakeIde,
  PROJECT_PATH,
  conversationOf,
  CONVERSATION_ID,
} from '../__fixtures__/fake-ide'
import { until } from '../__fixtures__/webcrypto-phone'
import { Bridge } from './bridge'
import { emptyFold, foldPatch, FeedJournal } from './feed-journal'
import { fitValue, PHONE_NOTE, packsThatFit, tailThatFits } from './fit'
import { openProjectKey } from './project-keys'

const PHONE = 'P'.repeat(22)

const bridges: Bridge[] = []

const setup = () => {
  const ide = fakeIde()
  const sent: AgentMessage[] = []
  const bridge = new Bridge({
    ports: ide.ports,
    send: (_deviceId, message) => sent.push(message),
    onTheLine: () => new Set([PHONE]),
    allow: () => true,
    machine: () => ({ label: 'Agentic Workstation on test', ideVersion: '0.1.0' }),
    epoch: 'epoch-1',
  })
  const say = (message: Omit<PhoneMessage, 'p'> & Record<string, unknown>) =>
    bridge.handle(PHONE, { p: 1, ...message } as PhoneMessage)
  const next = <K extends AgentMessage['k']>(kind: K, from = 0) =>
    until(
      () =>
        sent
          .slice(from)
          .find((message): message is Extract<AgentMessage, { k: K }> => message.k === kind),
      kind,
    )
  const command = async (name: string, args: unknown) => {
    const id = `c${sent.length}`

    say({ k: 'cmd', id, name, args })

    return until(
      () =>
        sent.find(
          (message): message is Extract<AgentMessage, { k: 'result' }> =>
            message.k === 'result' && message.id === id,
        ),
      `result of ${name}`,
    )
  }

  bridges.push(bridge)

  return { ide, sent, bridge, say, next, command }
}

afterEach(() => {
  for (const bridge of bridges.splice(0)) bridge.stop()
})

describe('инвентарь', () => {
  it('проекты ключами, разговоры с провайдером, очереди коротко - и ни одного пути', async () => {
    const { say, next } = setup()

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
    const { ide, sent, bridge, say, next } = setup()

    say({ k: 'inventory' })
    await next('inventory')

    const before = sent.length

    bridge.claudeChanged(ide.state)
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(sent.length).toBe(before)

    ide.state.conversations = [conversationOf({ status: 'running', workStartedAt: 5000 })]
    bridge.claudeChanged(ide.state)

    const changed = await next('inventory', before)

    expect(changed.projects[0]?.conversations[0]).toMatchObject({ status: 'running', since: 5000 })
  })
})

describe('лента разговора', () => {
  it('снимок, сложенные заплатки с номерами и догонка по номеру', async () => {
    const { ide, sent, bridge, say, next } = setup()

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
    const mark = sent.length

    say({ k: 'subscribe', conversationId: CONVERSATION_ID, since: 0, epoch: 'epoch-1' })
    expect((await next('patch', mark)).seq).toBe(1)
    expect(sent.slice(mark).some((message) => message.k === 'feed')).toBe(false)

    // Номер из прошлой жизни IDE - снимок.
    say({ k: 'subscribe', conversationId: CONVERSATION_ID, since: 1, epoch: 'old' })
    expect((await next('feed', mark)).seq).toBe(1)

    // Вкладку закрыли - телефону сказано, подписка снята.
    ide.state.conversations = []
    bridge.claudeChanged(ide.state)
    expect((await next('conversationGone')).conversationId).toBe(CONVERSATION_ID)
  })

  it('ленту, которую никто не смотрел, телефоны не получают', async () => {
    const { sent, bridge } = setup()

    bridge.feedPatched({ conversationId: CONVERSATION_ID, upserts: [itemOf('x', 'y')] })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(sent).toEqual([])
  })
})

describe('команды телефона', () => {
  it('разговор: сообщение, ответ без «всегда», остановка, имя, модель', async () => {
    const { ide, command } = setup()

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
      {
        ok: false,
        code: 'notFound',
      },
    )
  })

  it('новый разговор - в открытом проекте по ключу, с моделью и режимом', async () => {
    const { ide, command } = setup()
    const result = await command('conversation.new', {
      projectKey: openProjectKey(PROJECT_PATH),
      provider: 'claude',
      model: 'haiku',
      permissionMode: 'plan',
    })

    expect(result).toMatchObject({ ok: true, data: { conversationId: 'new-1' } })
    expect(ide.calls.map((call) => call.name)).toEqual(['newConversation', 'setOptions'])
    expect(ide.calls[1]?.args).toEqual(['new-1', { model: 'haiku', permissionMode: 'plan' }])
    expect(
      await command('conversation.new', { projectKey: `p-${'Z'.repeat(22)}`, provider: 'claude' }),
    ).toMatchObject({
      ok: false,
      code: 'notFound',
    })
  })

  it('сценарии: полки, запуск, очередь, прогон; закрыть очередь нельзя, незнакомое - отказ', async () => {
    const { ide, command } = setup()
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
    ).toMatchObject({
      ok: false,
      code: 'badArgs',
    })
    expect(await command('terminal.run', { command: 'ls' })).toMatchObject({
      ok: false,
      code: 'unknownCommand',
    })
  })
})

describe('сценарии на телефоне', () => {
  it('очереди проекта и прогон - без папок worktree и проекта', async () => {
    const { bridge, sent, say, next } = setup()

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

    const mark = sent.length

    bridge.runChanged({ ...RUN, state: 'paused' })
    expect((await next('run', mark)).run.state).toBe('paused')
  })
})

describe('журнал, складывание и кадр', () => {
  it('журнал отдаёт хвост после номера, а слишком старый номер - снимок', () => {
    const journal = new FeedJournal(2)

    for (let index = 0; index < 3; index += 1) {
      journal.append(
        (seq) => ({ p: 1, k: 'patch', conversationId: 'c', epoch: 'e', seq, upserts: [] }),
        10,
      )
    }

    expect(journal.lastSeq).toBe(3)
    expect(journal.after(1)?.map((message) => message.seq)).toEqual([2, 3])
    expect(journal.after(0)).toBeNull()
    expect(journal.after(3)).toEqual([])
    expect(journal.after(9)).toBeNull()
  })

  it('сложенные заплатки дают то же, что по очереди: снятое теряет вставку, вставленное после снятия - в конец', () => {
    const fold = emptyFold()

    foldPatch(fold, { conversationId: 'c', upserts: [itemOf('a', '1'), itemOf('b', '1')] })
    foldPatch(fold, { conversationId: 'c', upserts: [], removes: ['a'] })
    foldPatch(fold, { conversationId: 'c', upserts: [itemOf('b', '2')], tasks: [] })

    expect([...fold.upserts.keys()]).toEqual(['b'])
    expect([...fold.removes]).toEqual(['a'])
    expect(fold.tasks).toEqual([])
  })

  it('длинное режется с пометкой, хвост и пачки влезают в кадр', () => {
    const huge = itemOf('h', 'я'.repeat(300_000))
    const fitted = fitValue(huge)

    expect((fitted as unknown as { text: string }).text.endsWith(PHONE_NOTE)).toBe(true)

    const items = Array.from({ length: 50 }, (_, index) => itemOf(`i${index}`, 'x'.repeat(20_000)))
    const tail = tailThatFits(items, 200_000, 120)

    expect(tail.cut).toBe(true)
    expect(tail.items.at(-1)?.id).toBe('i49')
    expect(
      packsThatFit(items, 100_000).every((pack) => JSON.stringify(pack).length <= 100_000),
    ).toBe(true)
  })
})
