import { it, expect, describe, afterEach } from 'vitest'

import type { FeedItem } from '@shared/claude-feed'

import { MAX_BODY_BYTES } from '@agentic-workstation/remote-protocol/frame'
import type {
  HistoryWire,
  FeedPageWire,
  MessageImageWire,
} from '@agentic-workstation/remote-protocol/wire-types'

import { bridgeSetup, stopBridges } from '../__fixtures__/fake-bridge'
import { QUEUE, itemOf, RECENT_PATH, PROJECT_PATH, CONVERSATION_ID } from '../__fixtures__/fake-ide'
import { imageOf, PAST_SESSION } from '../__fixtures__/fake-reads'
import { sizeOf } from './fit'
import { projectKey } from './project-keys'
import { pageBefore, READ_BUDGET, historyThatFits, pictureThatFits } from './reads-fit'

afterEach(stopBridges)

const key = projectKey(PROJECT_PATH)

const items = (count: number, prefix = 'i'): FeedItem[] =>
  Array.from({ length: count }, (_, index) => itemOf(`${prefix}${index}`, `text ${index}`))

describe('история проекта с телефона', () => {
  it('свежие сверху, без папок в заголовках, открытые помечены', async () => {
    const { command } = bridgeSetup()
    const outcome = await command('conversation.history', { projectKey: key, provider: 'claude' })
    const history = (outcome as { data: HistoryWire }).data

    expect(history.entries.map((entry) => [entry.title, entry.isOpen])).toEqual([
      ['Fix the login bug', true],
      ['Refactor {project}/src/db', false],
    ])
    expect(history.more).toBe(false)
    expect(JSON.stringify(outcome)).not.toContain('/Users/')
  })

  it('закрытый проект, чужой ключ и незнакомый провайдер - отказ', async () => {
    const { command } = bridgeSetup()

    expect(
      await command('conversation.history', {
        projectKey: projectKey(RECENT_PATH),
        provider: 'claude',
      }),
    ).toMatchObject({ ok: false, code: 'notOpen' })
    expect(
      await command('conversation.history', {
        projectKey: `p-${'x'.repeat(22)}`,
        provider: 'claude',
      }),
    ).toMatchObject({ ok: false, code: 'notFound' })
    expect(
      await command('conversation.history', { projectKey: key, provider: 'codex' }),
    ).toMatchObject({ ok: false, code: 'refused', detail: 'providerMissing' })
  })

  it('продолжить прошлый - вкладка в IDE и её id; открытый - его id без смены вкладки в окне', async () => {
    const { ide, command } = bridgeSetup()
    const open = await command('conversation.openHistory', {
      projectKey: key,
      provider: 'claude',
      sessionId: '0d1c2b3a-4f5e-6d7c-8b9a-0f1e2d3c4b5a',
    })

    expect(open).toMatchObject({ ok: true, data: { conversationId: CONVERSATION_ID } })
    expect(ide.calls.some((call) => call.name === 'openHistory')).toBe(false)

    const past = await command('conversation.openHistory', {
      projectKey: key,
      provider: 'claude',
      sessionId: PAST_SESSION,
    })

    expect(past).toMatchObject({ ok: true, data: { conversationId: `history-${PAST_SESSION}` } })
    expect(ide.calls.find((call) => call.name === 'openHistory')?.args).toEqual([
      PROJECT_PATH,
      PAST_SESSION,
    ])

    expect(
      await command('conversation.openHistory', {
        projectKey: key,
        provider: 'claude',
        sessionId: '00000000-0000-0000-0000-000000000000',
      }),
    ).toMatchObject({ ok: false, code: 'notFound' })
  })
})

describe('страница ленты выше', () => {
  it('элементы перед самым ранним у телефона - ближние к нему, не больше страницы', async () => {
    const { ide, command } = bridgeSetup()

    ide.feed.items = items(70)

    const outcome = await command('conversation.earlier', {
      conversationId: CONVERSATION_ID,
      before: 'i65',
    })
    const page = (outcome as { data: FeedPageWire }).data

    expect(page.items.map((item) => item.id)).toEqual(
      items(65)
        .slice(5)
        .map((item) => item.id),
    )
    expect(page.hasEarlier).toBe(true)
    expect(ide.calls.some((call) => call.name === 'loadEarlier')).toBe(false)
  })

  it('лента IDE начинается тем же элементом - страница транскрипта, как «load earlier» окна', async () => {
    const { ide, command } = bridgeSetup()

    ide.feed.hasEarlier = true
    ide.earlier.push(itemOf('e0', `Read ${PROJECT_PATH}/README.md`), itemOf('e1', 'Earlier answer'))

    const outcome = await command('conversation.earlier', {
      conversationId: CONVERSATION_ID,
      before: 'u1',
    })

    expect(outcome).toMatchObject({ ok: true, data: { hasEarlier: false } })
    expect((outcome as { data: FeedPageWire }).data.items.map((item) => item.id)).toEqual([
      'e0',
      'e1',
    ])
    expect(JSON.stringify(outcome)).not.toContain('/Users/')
    expect(ide.calls.filter((call) => call.name === 'loadEarlier')).toHaveLength(1)
    // Лента IDE выросла вверх: следующая просьба телефона - уже от неё.
    expect(ide.feed.items.slice(0, 3).map((item) => item.id)).toEqual(['e0', 'e1', 'u1'])
  })

  it('элемента нет в ленте IDE - «не найдено»; разговор чужого ключа - тоже', async () => {
    const { command } = bridgeSetup()

    expect(
      await command('conversation.earlier', { conversationId: CONVERSATION_ID, before: 'gone' }),
    ).toMatchObject({ ok: false, code: 'notFound' })
    expect(
      await command('conversation.earlier', {
        conversationId: '00000000-0000-0000-0000-000000000000',
        before: 'u1',
      }),
    ).toMatchObject({ ok: false, code: 'notFound' })
  })

  it('страница влезает в кадр: что не влезло, приходит следующей страницей, а не пропадает', () => {
    const huge = (id: string) => itemOf(id, 'x'.repeat(200_000))
    const feed = [huge('h0'), huge('h1'), itemOf('last', 'ok')]
    const first = pageBefore(feed, 'last', false, (text) => text)

    expect(first).toMatchObject({ hasEarlier: true })
    expect(first?.items.map((item) => item.id)).toEqual(['h1'])
    expect(sizeOf({ p: 1, k: 'result', id: 'x'.repeat(64), ok: true, data: first })).toBeLessThan(
      MAX_BODY_BYTES,
    )
    expect(pageBefore(feed, 'h1', false, (text) => text)).toMatchObject({
      items: [{ id: 'h0' }],
      hasEarlier: false,
    })
    expect(pageBefore(feed, 'nope', false, (text) => text)).toBeNull()
  })
})

describe('картинка сообщения на телефон', () => {
  it('влезает в кадр - как есть; нет - уменьшенная копия с пометкой', async () => {
    const { ide, command } = bridgeSetup()

    ide.images.set('u1:0', imageOf(1000))
    ide.images.set('u1:1', imageOf(2_000_000))

    expect(
      await command('conversation.image', {
        conversationId: CONVERSATION_ID,
        messageId: 'u1',
        index: 0,
      }),
    ).toMatchObject({ ok: true, data: { dataUrl: imageOf(1000), reduced: false } })

    const big = await command('conversation.image', {
      conversationId: CONVERSATION_ID,
      messageId: 'u1',
      index: 1,
    })
    const picture = (big as { data: MessageImageWire }).data

    expect(picture.reduced).toBe(true)
    expect(picture.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
    expect(picture.dataUrl.length).toBeLessThanOrEqual(READ_BUDGET)
    // Ступени - по порядку, до первой, что влезла: 1600 не влезла, 1280 - да.
    expect(ide.calls.filter((call) => call.name === 'shrink').map((call) => call.args[0])).toEqual([
      1600, 1280,
    ])
  })

  it('картинки нет - «не найдено»; не читается или не влезает и мелкой - отказ своим словом', async () => {
    const { ide, command } = bridgeSetup()

    ide.images.set('u1:0', `${imageOf(2_000_000)}unreadable`)

    expect(
      await command('conversation.image', {
        conversationId: CONVERSATION_ID,
        messageId: 'u1',
        index: 0,
      }),
    ).toMatchObject({ ok: false, code: 'refused', detail: 'imageTooBig' })
    expect(
      await command('conversation.image', {
        conversationId: CONVERSATION_ID,
        messageId: 'u9',
        index: 0,
      }),
    ).toMatchObject({ ok: false, code: 'notFound' })
    expect(pictureThatFits(imageOf(2_000_000), () => imageOf(2_000_000))).toBeNull()
  })
})

describe('чтение по просьбе: пределы', () => {
  it('история длиннее кадра - свежие, сколько влезло, и «есть ещё»', () => {
    const long = Array.from({ length: 300 }, (_, index) => ({
      sessionId: `s${index}`,
      title: `${'t'.repeat(3000)} ${index}`,
      updatedAt: index,
      isOpen: false,
    }))
    const history = historyThatFits(long, (text) => text)

    expect(history.more).toBe(true)
    expect(history.entries[0]?.sessionId).toBe('s299')
    expect(history.entries.length).toBeLessThan(100)
    expect(sizeOf(history)).toBeLessThanOrEqual(READ_BUDGET)
  })

  it('доска очередей знает имя проекта: открытого - его имя, без вкладки и недавних - папку', async () => {
    const { ide, say, next } = bridgeSetup()

    ide.queues.queues = [
      QUEUE,
      { ...QUEUE, id: 'q9', projectPath: '/Users/someone/Projects/forgotten-app' },
    ]
    say({ k: 'subscribe', projectKey: '*' })

    const queues = await next('queues')

    expect(queues.queues.map((queue) => queue.projectName)).toEqual([
      'secret-client',
      'forgotten-app',
    ])
    expect(JSON.stringify(queues)).not.toContain('/Users/')
  })
})
