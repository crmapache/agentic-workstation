import { it, expect, describe, afterEach } from 'vitest'

import type { FeedItem, TaskEntry } from '@shared/claude-feed'

import type { AgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { encodeBody } from '@agentic-workstation/remote-protocol/body'
import { MAX_BODY_BYTES } from '@agentic-workstation/remote-protocol/frame'
import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'

import { HOME, settle, bridgeSetup, stopBridges } from '../__fixtures__/fake-bridge'
import {
  RUN,
  QUEUE,
  itemOf,
  PROJECT_PATH,
  conversationOf,
  CONVERSATION_ID,
} from '../__fixtures__/fake-ide'
import { FeedDesk, JOURNAL_IDLE_MS } from './feed-desk'
import { emptyFold, foldPatch, FeedJournal } from './feed-journal'
import { asIs, fitItem, fitValue, cutStrings, PHONE_NOTE, packsThatFit, tailThatFits } from './fit'
import { pathRedactor, PROJECT_LABEL, WORKTREE_LABEL } from './redact'

afterEach(stopBridges)

const wire = (item: FeedItem) => item as unknown as FeedItemWire

describe('журнал и складывание', () => {
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

  it('журнал на месте убранного продолжает номера с пропуском: старый номер - снимок', () => {
    const journal = new FeedJournal(undefined, undefined, 7)

    expect(journal.lastSeq).toBe(8)
    expect(journal.after(7)).toBeNull()
    expect(journal.after(8)).toEqual([])
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
})

describe('кадр', () => {
  it('длинное режется с пометкой, хвост и пачки влезают в кадр', () => {
    const fitted = fitValue(itemOf('h', 'я'.repeat(300_000)))

    expect((fitted as unknown as { text: string }).text.endsWith(PHONE_NOTE)).toBe(true)

    const items = Array.from({ length: 50 }, (_, index) =>
      wire(itemOf(`i${index}`, 'x'.repeat(20_000))),
    )
    const tail = tailThatFits(items, 200_000, 120)

    expect(tail.cut).toBe(true)
    expect(tail.items.at(-1)?.id).toBe('i49')
    expect(
      packsThatFit(items, 100_000).every((pack) => JSON.stringify(pack).length <= 100_000),
    ).toBe(true)
  })

  it('обрезка не удлиняет: строка, которой пометка не короче, остаётся целой', () => {
    for (const length of [201, 240, 200 + PHONE_NOTE.length]) {
      expect(cutStrings('y'.repeat(length), 200)).toBe('y'.repeat(length))
    }

    expect(String(cutStrings('y'.repeat(300), 200))).toHaveLength(200 + PHONE_NOTE.length)

    // Самая короткая ступень: длинную строку режет, а строки по 240 знаков так и остаются 240.
    const value = { lines: [...Array<string>(300).fill('y'.repeat(240)), 'z'.repeat(50_000)] }
    const fitted = fitValue(value, 73_500)

    expect(fitted?.lines.slice(0, 300).every((line) => line.length === 240)).toBe(true)
    expect(fitted?.lines.at(-1)).toBe(`${'z'.repeat(200)}${PHONE_NOTE}`)
  })

  it('элемент, не влезающий и урезанным, становится карточкой, а не пропадает', () => {
    const huge = wire({
      ...itemOf('t1', 'short text'),
      kind: 'tool',
      status: 'done',
      result: { lines: Array.from({ length: 30_000 }, (_, index) => `line ${index}`) },
    } as unknown as FeedItem)
    const card = fitItem(huge, 50_000)

    expect(card).toMatchObject({ id: 't1', kind: 'tool', status: 'done', stub: true })
    expect(JSON.stringify(card).length).toBeLessThan(1000)
    expect(
      packsThatFit([huge], 50_000)
        .flat()
        .map((item) => item.id),
    ).toEqual(['t1'])
    expect(tailThatFits([huge], 50_000, 10).items.map((item) => item.id)).toEqual(['t1'])
  })
})

describe('папки машины', () => {
  const redact = pathRedactor([
    { path: '/Users/me/proj', label: PROJECT_LABEL },
    { path: '/Users/me/.aw/worktrees/proj-1/cleanup/', label: WORKTREE_LABEL },
    { path: '/Users/me', label: '~' },
  ])

  it('корень проекта, worktree и дом - метками, длинный раньше короткого, только целым именем', () => {
    expect(redact('edit /Users/me/proj/src/app.ts')).toBe('edit {project}/src/app.ts')
    expect(redact('cd /Users/me/.aw/worktrees/proj-1/cleanup && ls')).toBe('cd {worktree} && ls')
    expect(redact('/Users/me/proj2/x')).toBe('~/proj2/x')
    expect(redact('/Users/me/.zshrc')).toBe('~/.zshrc')
    expect(redact('no paths here')).toBe('no paths here')
    expect(asIs('/Users/me')).toBe('/Users/me')
  })

  it('по дороге на телефон: лента, вопрос разрешения, ошибка прогона, очереди - без папок', async () => {
    const { ide, bridge, say, next, sentTo } = bridgeSetup()
    const worktree = QUEUE.workdir.kind === 'worktree' ? QUEUE.workdir.path : ''
    const pending = {
      kind: 'permission' as const,
      requestId: 'p1',
      toolUseId: 't1',
      toolName: 'Edit',
      input: { file_path: `${PROJECT_PATH}/src/login.ts` },
      description: `Edit ${PROJECT_PATH}/src/login.ts`,
      reason: '',
      alwaysKind: 'rule' as const,
      mode: 'default' as const,
    }

    ide.state.conversations = [conversationOf({ pending, status: 'waiting' })]
    ide.feed.items = [itemOf('a1', `I changed ${PROJECT_PATH}/src/login.ts and ${HOME}/.npmrc`)]

    say({ k: 'subscribe', conversationId: CONVERSATION_ID })
    say({ k: 'subscribe', runId: 'r1' })

    const state = await next('conversation')
    const snapshot = await next('feed')

    await next('run')

    const mark = sentTo().length

    bridge.runChanged({ ...RUN, error: `git failed in ${worktree}/src`, state: 'failed' })

    const run = await next('run', mark)

    for (const message of [state, snapshot, run] as AgentMessage[]) {
      expect(JSON.stringify(message)).not.toContain('/Users/')
    }

    expect(state.conversation.pending).toMatchObject({
      description: 'Edit {project}/src/login.ts',
      input: { file_path: '{project}/src/login.ts' },
    })
    expect(run.run.error).toBe('git failed in {worktree}/src')
    expect(snapshot.items[0]).toMatchObject({
      text: 'I changed {project}/src/login.ts and ~/.npmrc',
    })
    // Окно IDE видит своё как было: подменяется только копия на проводе.
    expect(JSON.stringify(ide.feed.items[0])).toContain(PROJECT_PATH)
    expect(ide.state.conversations[0]?.pending).toBe(pending)
  })
})

describe('снимок ленты и журналы', () => {
  const host = (over: Partial<ConstructorParameters<typeof FeedDesk>[0]> = {}) => {
    const sent: AgentMessage[] = []
    const desk = new FeedDesk({
      getFeed: (conversationId) =>
        Promise.resolve({
          conversationId,
          items: [itemOf('u1', 'hi')],
          tasks: [],
          hasEarlier: false,
        }),
      send: (_deviceId, message) => {
        sent.push(message)

        return true
      },
      awake: () => true,
      redact: () => asIs,
      epoch: 'e',
      ...over,
    })

    return { desk, sent }
  }

  it('снимок с огромным списком задач влезает в кадр вместе с конвертом', async () => {
    const tasks: TaskEntry[] = Array.from({ length: 4000 }, (_, index) => ({
      id: `t${index}`,
      subject: `Task ${index} `.repeat(10),
      activeForm: 'Working',
      state: 'pending',
    }))
    const items = Array.from({ length: 120 }, (_, index) => itemOf(`i${index}`, 'x'.repeat(3000)))
    const { desk, sent } = host({
      getFeed: (conversationId) =>
        Promise.resolve({ conversationId, items, tasks, hasEarlier: false }),
    })

    await desk.watch('d', 'c', undefined, undefined)

    const snapshot = sent.find((message) => message.k === 'feed')

    expect(snapshot).toBeDefined()
    expect(encodeBody(snapshot ?? {}).length).toBeLessThanOrEqual(MAX_BODY_BYTES)
    expect(snapshot && 'hasEarlier' in snapshot && snapshot.hasEarlier).toBe(true)
  })

  it('снимок не ушёл - подписка не живая, заплатки ему не идут', async () => {
    let accept = false
    const { desk, sent } = host({
      send: (_deviceId, message) => {
        if (accept) sent.push(message)

        return accept
      },
    })

    await desk.watch('d', 'c', undefined, undefined)
    accept = true
    desk.patched({ conversationId: 'c', upserts: [itemOf('a1', 'x')] })
    await settle(200)

    expect(desk.watching('d')).toBeNull()
    expect(sent).toEqual([])
  })

  it('журнал, который никто не смотрит, уходит через десять минут, смотримый - живёт', async () => {
    let now = 0
    const { desk } = host({ now: () => now })

    await desk.watch('a', 'watched', undefined, undefined)
    await desk.watch('b', 'left', undefined, undefined)
    desk.unwatch('b', 'left')
    // Телефон перешёл на другой разговор - прежний тоже никто не смотрит.
    await desk.watch('c', 'switched', undefined, undefined)
    await desk.watch('c', 'watched', undefined, undefined)
    now = JOURNAL_IDLE_MS + 1
    desk.sweep()

    expect(desk.journalCount()).toBe(1)
    expect(desk.watching('a')).toBe('watched')
  })
})
