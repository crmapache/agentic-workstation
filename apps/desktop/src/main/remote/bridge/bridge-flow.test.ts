import { it, expect, describe, afterEach } from 'vitest'

import type { ConversationFeed } from '@shared/claude-feed'
import type { ScenarioStartOutcome } from '@shared/scenario-queues'

import {
  gate,
  PHONE,
  settle,
  bridgeSetup,
  OTHER_PHONE,
  stopBridges,
} from '../__fixtures__/fake-bridge'
import {
  RUN,
  QUEUE,
  itemOf,
  PROJECT_PATH,
  conversationOf,
  CONVERSATION_ID,
} from '../__fixtures__/fake-ide'
import { until } from '../__fixtures__/webcrypto-phone'
import { openProjectKey, recentProjectKey } from './project-keys'

/**
 * Порядок и жизнь просьб телефона: отмена ждущего при отзыве и выключении, долгая команда, не
 * держащая остальные, повтор команды по id, подписки (заново, по папке, новые ключи, отписка
 * от другого), спящий телефон и новая линия.
 */

afterEach(stopBridges)

const START_ARGS = {
  projectKey: openProjectKey(PROJECT_PATH),
  scenarioId: 'tidy',
  scope: 'project',
  inputs: { what: 'docs' },
  provider: 'claude',
  target: { kind: 'new', worktree: true },
  afterSuccess: false,
}

/** Транскрипт, который поднимается, пока тест не отпустит: очередь телефона стоит на нём. */
const slowFeed = (setup: ReturnType<typeof bridgeSetup>) => {
  const feed = gate<ConversationFeed>()

  setup.ide.ports.conversations.getFeed = () => feed.promise

  return () => feed.release(setup.ide.feed)
}

describe('очередь просьб телефона', () => {
  it('отзыв отменяет команды, ждущие в очереди: ни одна не доходит до IDE', async () => {
    const setup = bridgeSetup()
    const release = slowFeed(setup)

    setup.say({ k: 'subscribe', conversationId: CONVERSATION_ID })
    setup.say({
      k: 'cmd',
      id: 'm1',
      name: 'conversation.send',
      args: { conversationId: CONVERSATION_ID, text: 'rm -rf, please' },
    })
    await settle()

    setup.known.delete(PHONE)
    setup.bridge.forget(PHONE)
    release()
    await settle(50)

    expect(setup.ide.calls.map((call) => call.name)).not.toContain('send')
  })

  it('выключение тоже: мост погас - ждущее не начинается', async () => {
    const setup = bridgeSetup()
    const release = slowFeed(setup)

    setup.say({ k: 'subscribe', conversationId: CONVERSATION_ID })
    setup.say({
      k: 'cmd',
      id: 'm1',
      name: 'conversation.interrupt',
      args: { conversationId: CONVERSATION_ID },
    })
    await settle()

    setup.bridge.stop()
    release()
    await settle(50)

    expect(setup.ide.calls).toEqual([])
  })

  it('долгий запуск сценария не держит «стоп»: interrupt доходит до IDE сразу', async () => {
    const setup = bridgeSetup()
    const start = gate<ScenarioStartOutcome>()

    setup.ide.ports.scenarios.start = (request) => {
      setup.ide.calls.push({ name: 'scenarios.start', args: [request] })

      return start.promise
    }

    setup.say({ k: 'cmd', id: 's1', name: 'scenarios.start', args: START_ARGS })

    const stopped = await setup.command('conversation.interrupt', {
      conversationId: CONVERSATION_ID,
    })

    expect(stopped).toMatchObject({ ok: true })
    expect(setup.ide.calls.map((call) => call.name)).toEqual(['scenarios.start', 'interrupt'])
    expect(setup.sentTo().some((message) => message.k === 'result' && message.id === 's1')).toBe(
      false,
    )

    start.release({ ok: true, queueId: 'q2', itemId: 'i2' })
    expect(await setup.resultOf('s1')).toMatchObject({ ok: true, data: { queueId: 'q2' } })
  })

  it('итог долгой команды отпущенному телефону не шлётся', async () => {
    const setup = bridgeSetup()
    const start = gate<ScenarioStartOutcome>()

    setup.ide.ports.scenarios.start = () => start.promise
    setup.say({ k: 'cmd', id: 's1', name: 'scenarios.start', args: START_ARGS })
    await settle()
    setup.bridge.forget(PHONE)
    start.release({ ok: true, queueId: 'q2', itemId: 'i2' })
    await settle()

    expect(setup.sentTo().some((message) => message.k === 'result')).toBe(false)
  })
})

describe('повтор команды по id', () => {
  it('после итога - тот же итог, без второго выполнения', async () => {
    const { ide, command, sentTo } = bridgeSetup()
    const args = { conversationId: CONVERSATION_ID, text: 'once' }
    const first = await command('conversation.send', args, 'same')
    const before = sentTo().length

    command('conversation.send', args, 'same').catch(() => undefined)

    const again = await until(
      () =>
        sentTo()
          .slice(before)
          .find((message) => message.k === 'result'),
      'repeated result',
    )

    expect(again).toEqual(first)
    expect(ide.calls.filter((call) => call.name === 'send')).toHaveLength(1)
  })

  it('пока первая выполняется - повтор ждёт её итог, а не запускает вторую', async () => {
    const { ide, say, sentTo, bridge, resultOf } = bridgeSetup()
    const start = gate<ScenarioStartOutcome>()

    ide.ports.scenarios.start = (request) => {
      ide.calls.push({ name: 'scenarios.start', args: [request] })

      return start.promise
    }

    say({ k: 'cmd', id: 's1', name: 'scenarios.start', args: START_ARGS })
    await settle()
    expect(bridge.knows(PHONE, 's1')).toBe(true)
    say({ k: 'cmd', id: 's1', name: 'scenarios.start', args: START_ARGS })
    await settle()
    start.release({ ok: true, queueId: 'q2', itemId: 'i2' })
    await resultOf('s1')
    await settle()

    expect(ide.calls.filter((call) => call.name === 'scenarios.start')).toHaveLength(1)
    expect(sentTo().filter((message) => message.k === 'result')).toHaveLength(1)
  })
})

describe('подписки', () => {
  it('подписка заново на тот же разговор шлёт его состояние снова', async () => {
    const { say, next, sentTo } = bridgeSetup()

    say({ k: 'subscribe', conversationId: CONVERSATION_ID })
    await next('feed')

    const mark = sentTo().length

    say({ k: 'subscribe', conversationId: CONVERSATION_ID })
    expect((await next('conversation', mark)).conversation.id).toBe(CONVERSATION_ID)
  })

  it('очереди проекта держатся за папку: проект закрыли - список тот же, ключи новые', async () => {
    const { ide, bridge, say, next, sentTo } = bridgeSetup()
    const key = openProjectKey(PROJECT_PATH)

    say({ k: 'subscribe', projectKey: key })
    expect((await next('queues')).queues.map((queue) => queue.id)).toEqual(['q1'])

    const mark = sentTo().length

    // Проект закрыли: его ключ теперь r-, а очереди - те же.
    ide.workspace.projects = []
    ide.workspace.recentProjects = [
      ...ide.workspace.recentProjects,
      { name: 'secret-client', rootPath: PROJECT_PATH },
    ]
    bridge.workspaceChanged()

    const after = await next('queues', mark)

    expect(after.scope).toBe(key)
    expect(after.queues.map((queue) => queue.id)).toEqual(['q1'])
    expect(after.queues[0]?.projectKey).toBe(recentProjectKey(PROJECT_PATH))

    // Телефон со старым ключом подписывается заново - те же очереди, а не пустота.
    say({ k: 'subscribe', projectKey: key })
    expect((await next('queues', sentTo().length - 1)).queues).toHaveLength(1)
  })

  it('незнакомый ключ проекта - «не найдено», а не пустой список', async () => {
    const { say, next, sentTo } = bridgeSetup()

    say({ k: 'subscribe', projectKey: `p-${'Z'.repeat(22)}` })

    expect(await next('notice')).toMatchObject({ code: 'notFound', about: `p-${'Z'.repeat(22)}` })
    expect(sentTo().some((message) => message.k === 'queues')).toBe(false)
  })

  it('новые ключи телефона снимают подписки прежней страницы', async () => {
    const { bridge, say, next, sentTo } = bridgeSetup()

    say({ k: 'subscribe', conversationId: CONVERSATION_ID })
    say({ k: 'subscribe', projectKey: '*' })
    await next('feed')
    await next('queues')
    bridge.newKeys(PHONE)
    await settle()

    const mark = sentTo().length

    bridge.feedPatched({ conversationId: CONVERSATION_ID, upserts: [itemOf('a9', 'late')] })
    bridge.queuesChanged()
    await settle(250)

    expect(sentTo().slice(mark)).toEqual([])
  })

  it('отписка от другого разговора, прогона или очередей не снимает текущую подписку', async () => {
    const { bridge, say, next, sentTo } = bridgeSetup()

    say({ k: 'subscribe', conversationId: CONVERSATION_ID })
    say({ k: 'subscribe', runId: 'r1' })
    say({ k: 'subscribe', projectKey: '*' })
    await next('feed')
    await next('queues')
    say({ k: 'unsubscribe', conversationId: 'another-one' })
    say({ k: 'unsubscribe', runId: 'r9' })
    say({ k: 'unsubscribe', projectKey: openProjectKey(PROJECT_PATH) })
    await settle()

    const mark = sentTo().length

    bridge.feedPatched({ conversationId: CONVERSATION_ID, upserts: [itemOf('a3', 'still')] })
    bridge.runChanged({ ...RUN, state: 'paused' })
    bridge.queuesChanged()

    expect((await next('patch', mark)).upserts[0]?.id).toBe('a3')
    expect((await next('run', mark)).run.state).toBe('paused')
  })
})

describe('спящий телефон и новая линия', () => {
  it('спящему лента и состояние не шлются; проснулся - догоняет из журнала', async () => {
    const { ide, bridge, awake, say, next, sentTo } = bridgeSetup()

    say({ k: 'subscribe', conversationId: CONVERSATION_ID })
    say({ k: 'subscribe', projectKey: '*' })
    await next('feed')
    await next('queues')
    awake.delete(PHONE)

    const mark = sentTo().length

    bridge.feedPatched({ conversationId: CONVERSATION_ID, upserts: [itemOf('a4', 'while asleep')] })
    ide.state.conversations = [conversationOf({ status: 'running', workStartedAt: 9 })]
    bridge.claudeChanged(ide.state)
    ide.queues.queues = [{ ...QUEUE, name: 'Renamed while asleep' }]
    bridge.queuesChanged()
    await settle(250)
    expect(sentTo().slice(mark)).toEqual([])

    awake.add(PHONE)
    bridge.woke(PHONE)

    expect((await next('patch', mark)).upserts[0]?.id).toBe('a4')
    expect((await next('conversation', mark)).conversation.status).toBe('running')
    expect((await next('queues', mark)).queues[0]?.name).toBe('Renamed while asleep')
  })

  it('новая линия: тем, кто на связи, - «переспроси», и состояние уходит заново', async () => {
    const { ide, bridge, awake, say, next, sentTo } = bridgeSetup()

    say({ k: 'subscribe', conversationId: CONVERSATION_ID })
    await next('feed')
    awake.delete(OTHER_PHONE)

    const mark = sentTo().length

    bridge.linkUp()
    expect(sentTo().slice(mark)).toEqual([{ p: 1, k: 'resync' }])
    expect((await next('inventory', mark)).machine.label).toBe('Agentic Workstation on test')
    expect(sentTo(OTHER_PHONE)).toEqual([])

    // Тот же разговор, то же состояние - но после новой линии оно уходит снова.
    bridge.claudeChanged(ide.state)
    expect((await next('conversation', mark)).conversation.id).toBe(CONVERSATION_ID)
  })
})
