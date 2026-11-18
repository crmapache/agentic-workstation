import { it, expect, describe } from 'vitest'

import type { FeedItem } from '@shared/claude-feed'

import type {
  AgentMessage,
  FeedPatchMessage,
  FeedSnapshotMessage,
} from '@agentic-workstation/remote-protocol/agent-messages'
import { encodeBody } from '@agentic-workstation/remote-protocol/body'
import { MAX_BODY_BYTES } from '@agentic-workstation/remote-protocol/frame'

import { settle } from '../__fixtures__/fake-bridge'
import { itemOf } from '../__fixtures__/fake-ide'
import { FeedDesk, SNAPSHOT_ROWS } from './feed-desk'
import { StepLedger } from './feed-steps'
import { tailWindow, hasRowBefore, windowBefore } from './feed-window'
import { asIs, sizeOf, PHONE_NOTE } from './fit'
import { READ_BUDGET } from './reads-fit'

/**
 * Окно ленты телефону в строках: долгий субагент с сотнями шагов не вытесняет из снимка и
 * страницы сами строки - шаги едут счётом на строке вызова (ошибка «Load earlier ничего не
 * делает»: окно из одних шагов, которые телефон прячет).
 */

const call = (id: string): FeedItem => ({
  kind: 'tool',
  id,
  parentToolUseId: null,
  name: 'Agent',
  input: { description: 'long job' },
  action: { kind: 'agent', agent: '', description: 'long job', prompt: '', workflow: false },
  status: 'running',
  result: null,
  startedAt: 0,
  endedAt: 0,
  closedReason: null,
})

/** Шаг субагента: чтение файла с выводом - тяжёлый, как настоящий. */
const step = (id: string, parent: string): FeedItem => ({
  kind: 'tool',
  id,
  parentToolUseId: parent,
  name: 'Read',
  input: { file_path: `/p/${id}.ts` },
  action: { kind: 'read', path: `/p/${id}.ts`, line: null },
  status: 'done',
  result: { text: 'x'.repeat(10_000), isError: false, truncated: false },
  startedAt: 0,
  endedAt: 0,
  closedReason: null,
})

const steps = (count: number, parent: string, from = 0): FeedItem[] =>
  Array.from({ length: count }, (_, index) => step(`${parent}-s${from + index}`, parent))

/** Разговор: 200 старых строк, сообщение, вызов субагента и 400 его шагов в конце. */
const longRun = (): FeedItem[] => [
  ...Array.from({ length: 200 }, (_, index) => itemOf(`old${index}`, `old answer ${index}`)),
  itemOf('u', 'Refactor the auth module'),
  call('agent'),
  ...steps(400, 'agent'),
]

const ids = (items: readonly { id: string }[]) => items.map((item) => item.id)

describe('окно ленты в строках', () => {
  it('хвост из 400 шагов субагента: в снимке - строка вызова со счётом 400, а не шаги', () => {
    const tail = tailWindow(longRun(), MAX_BODY_BYTES - 1000, SNAPSHOT_ROWS)

    expect(tail.items).toHaveLength(SNAPSHOT_ROWS)
    expect(ids(tail.items).slice(-2)).toEqual(['u', 'agent'])
    expect(tail.items.some((item) => item['parentToolUseId'] === 'agent')).toBe(false)
    expect(tail.steps).toEqual({ agent: 400 })
    expect(tail.cut).toBe(true)
  })

  it('страница выше - строки, а не шаги; счёт - у вызова на странице, по всей ленте', () => {
    const feed = [...longRun(), itemOf('late', 'Done with the first part')]
    const page = windowBefore(feed, 'late', READ_BUDGET, 60)

    expect(ids(page?.items ?? []).slice(-2)).toEqual(['u', 'agent'])
    expect(page?.items).toHaveLength(60)
    expect(page?.steps).toEqual({ agent: 400 })
    expect(page?.cut).toBe(true)
    // От самой ранней строки телефона - строки выше неё, шагов среди них нет.
    expect(ids(windowBefore(feed, 'old5', READ_BUDGET, 60)?.items ?? [])).toEqual(
      ids(feed.slice(0, 5)),
    )
    expect(windowBefore(feed, 'nope', READ_BUDGET, 60)).toBeNull()
  })

  it('шаги вызова, которого в ленте нет (агент скилла), - обычные строки', () => {
    const feed = [itemOf('u', 'go'), ...steps(3, 'skill-agent')]
    const tail = tailWindow(feed, READ_BUDGET, 60)

    expect(ids(tail.items)).toEqual(['u', 'skill-agent-s0', 'skill-agent-s1', 'skill-agent-s2'])
    expect(tail.steps).toEqual({})
  })

  it('шаги параллельных субагентов вперемешку с ответом: счёт каждому своему вызову', () => {
    const feed = [
      call('a'),
      call('b'),
      ...steps(2, 'a'),
      ...steps(3, 'b'),
      itemOf('note', 'Both are running'),
      ...steps(1, 'a', 2),
    ]
    const tail = tailWindow(feed, READ_BUDGET, 60)

    expect(ids(tail.items)).toEqual(['a', 'b', 'note'])
    expect(tail.steps).toEqual({ a: 3, b: 3 })
  })

  it('окно не бывает пустым, пока выше есть строка: ближняя влезает и ровно в бюджет', () => {
    const budget = 50_000
    const bare = sizeOf(itemOf('big', ''))
    // Ровно бюджет: без запаса на запятую прежний хвост не брал такой элемент вовсе.
    const exact = itemOf('big', 'y'.repeat(budget - bare))

    expect(sizeOf(exact)).toBe(budget)

    const tail = tailWindow([itemOf('small', 'hi'), exact], budget, 60)

    // Ближняя урезана с пометкой и влезла - и под соседнюю место осталось.
    expect(ids(tail.items)).toEqual(['small', 'big'])
    expect(String(tail.items[1]?.['text']).endsWith(PHONE_NOTE)).toBe(true)
    expect(tail.cut).toBe(false)
    expect(sizeOf(tail.items)).toBeLessThanOrEqual(budget)
    // Строка со счётом шагов - и место под счёт вычитается из неё самой.
    const counted = tailWindow([call('agent'), ...steps(2, 'agent')], 300, 60, asIs)

    expect(ids(counted.items)).toEqual(['agent'])
    expect(counted.steps).toEqual({ agent: 2 })
  })

  it('есть ли строка выше: шаги не в счёт, незнакомый элемент - null', () => {
    const feed = [call('agent'), ...steps(3, 'agent'), itemOf('a', 'ok')]

    expect(hasRowBefore(feed, 'agent')).toBe(false)
    expect(hasRowBefore(feed, 'a')).toBe(true)
    expect(hasRowBefore(feed, 'nope')).toBeNull()
  })
})

describe('память шагов для живых заплаток', () => {
  const seeded = () => {
    const ledger = new StepLedger()

    ledger.seed(longRun())

    return ledger
  }

  it('новый шаг - новое число вызова, а не вставка; повтор шага (итог вызова) - ничего', () => {
    const ledger = seeded()

    expect(ledger.apply([step('agent-s400', 'agent')], [])).toEqual({
      rows: [],
      steps: { agent: 401 },
    })
    expect(ledger.apply([step('agent-s400', 'agent')], [])).toEqual({ rows: [], steps: {} })
    // Повторный снимок той же ленты ничего не прибавит.
    ledger.seed(longRun())
    expect(ledger.apply([step('agent-s401', 'agent')], [])).toEqual({
      rows: [],
      steps: { agent: 402 },
    })
  })

  it('вызов и его первый шаг в одной заплатке, строка рядом, снятый шаг уменьшает счёт', () => {
    const ledger = seeded()
    const answer = itemOf('a2', 'Next')
    const patched = ledger.apply([call('agent2'), step('agent2-s0', 'agent2'), answer], [])

    expect(ids(patched.rows)).toEqual(['agent2', 'a2'])
    expect(patched.steps).toEqual({ agent2: 1 })
    expect(ledger.apply([], ['agent-s0', 'agent-s1'])).toEqual({
      rows: [],
      steps: { agent: 398 },
    })
  })

  it('шаг без вызова - строкой; вызов пришёл позже - его шаги уже счётом', () => {
    const ledger = seeded()

    expect(ids(ledger.apply([step('late-s0', 'late')], []).rows)).toEqual(['late-s0'])
    expect(ledger.apply([call('late'), step('late-s0', 'late')], [])).toEqual({
      rows: [call('late')],
      steps: { late: 1 },
    })
  })
})

describe('ленты телефонам: снимок и заплатки', () => {
  const host = (getFeed: () => Promise<FeedItem[]>) => {
    const sent: AgentMessage[] = []
    const desk = new FeedDesk({
      getFeed: async (conversationId) => ({
        conversationId,
        items: await getFeed(),
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
    })
    const patches = () =>
      sent.filter((message): message is FeedPatchMessage => message.k === 'patch')

    return { desk, sent, patches }
  }

  it('снимок долгого субагента - строки и счёт 400, в кадр; новый шаг - только счёт', async () => {
    const { desk, sent, patches } = host(() => Promise.resolve(longRun()))

    await desk.watch('d', 'c', undefined, undefined)

    const snapshot = sent.find((message): message is FeedSnapshotMessage => message.k === 'feed')

    expect(ids(snapshot?.items ?? []).slice(-2)).toEqual(['u', 'agent'])
    expect(snapshot?.steps).toEqual({ agent: 400 })
    expect(snapshot?.hasEarlier).toBe(true)
    expect(encodeBody(snapshot ?? {}).length).toBeLessThanOrEqual(MAX_BODY_BYTES)

    desk.patched({ conversationId: 'c', upserts: [step('agent-s400', 'agent')] })
    await settle(200)

    expect(patches()).toEqual([expect.objectContaining({ upserts: [], steps: { agent: 401 } })])

    // Итог вызова внутри субагента - тот же шаг ещё раз: телефону слать нечего.
    desk.patched({ conversationId: 'c', upserts: [step('agent-s400', 'agent')] })
    await settle(200)

    expect(patches()).toHaveLength(1)

    desk.patched({
      conversationId: 'c',
      upserts: [itemOf('a9', 'Halfway'), step('agent-s401', 'agent')],
    })
    await settle(200)

    expect(patches().at(-1)).toMatchObject({ upserts: [{ id: 'a9' }], steps: { agent: 402 } })
  })

  it('заплатка, пришедшая пока снимок читал ленту, ждёт его: шаг не уходит строкой', async () => {
    let release: (items: FeedItem[]) => void = () => undefined
    const { desk, sent, patches } = host(
      () => new Promise<FeedItem[]>((resolve) => (release = resolve)),
    )
    const watching = desk.watch('d', 'c', undefined, undefined)

    desk.patched({ conversationId: 'c', upserts: [step('agent-s400', 'agent')] })
    await settle(200)

    expect(sent).toEqual([])

    release(longRun())
    await watching
    await settle(200)

    expect(patches()).toEqual([expect.objectContaining({ upserts: [], steps: { agent: 401 } })])
  })

  it('новый журнал, а у телефона номер 0 той же жизни IDE - всё равно снимок', async () => {
    const { desk, sent } = host(() => Promise.resolve(longRun()))

    await desk.watch('d', 'c', 0, 'e')

    expect(sent.map((message) => message.k)).toEqual(['feed'])
  })
})
