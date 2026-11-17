import { randomUUID } from 'node:crypto'

import type {
  GoalLife,
  GoalWait,
  GoalEvent,
  GoalWatch,
  GoalDecision,
  GoalEventKind,
} from '@shared/goals'

import { parseWhen, NoticeError } from '../inbox/inbox-notice'
import { ArgumentError } from '../connectors/kinds/native-tools'
import {
  MAX_EVERY_MIN,
  MIN_LOOK_EVERY_MIN,
  MIN_TOOL_EVERY_MIN,
  DEFAULT_LOOK_EVERY_MIN,
  DEFAULT_TOOL_EVERY_MIN,
} from './goal-clock'

/** Пределы: журнал - страница, а не архив; история - последние события; сторожей - горсть. */
export const JOURNAL_MAX = 8_000
export const EVENTS_KEPT = 100
export const SEEN_MAX = 8_000
const REASON_MAX = 200
const EXPECT_MAX = 600
const INSTRUCTIONS_MAX = 2_000
const ARGS_MAX = 4_000
const TOOL_WATCHES_MAX = 5
const LOOK_WATCHES_MAX = 3

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '')

const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

const SERVER_NAME = /^[a-z0-9-]{1,64}$/

const TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/

const EVENT_KINDS: readonly GoalEventKind[] = [
  'started',
  'slept',
  'changed',
  'noise',
  'watchFailed',
  'woke',
  'chapter',
  'resumed',
  'retry',
  'nudged',
  'confirmAsked',
  'confirmed',
  'refused',
  'finished',
  'limit',
]

const watchOf = (raw: unknown): GoalWatch | null => {
  if (!isRecord(raw) || typeof raw['id'] !== 'string') return null

  const kind = raw['kind'] === 'look' ? 'look' : 'tool'

  return {
    id: raw['id'],
    kind,
    server: text(raw['server'], 64),
    tool: text(raw['tool'], 128),
    args: isRecord(raw['args']) ? raw['args'] : {},
    instructions: text(raw['instructions'], INSTRUCTIONS_MAX),
    expect: text(raw['expect'], EXPECT_MAX),
    everyMin: Math.min(MAX_EVERY_MIN, Math.max(MIN_TOOL_EVERY_MIN, number(raw['everyMin']))),
    nextAt: number(raw['nextAt']),
    lastAt: number(raw['lastAt']),
    changedAt: number(raw['changedAt']),
    hash: text(raw['hash'], 128),
    seen: text(raw['seen'], SEEN_MAX),
    failures: number(raw['failures']),
    lastError: text(raw['lastError'], 500),
  }
}

export const storedWaitOf = (raw: unknown): GoalWait | null => {
  if (!isRecord(raw)) return null

  return {
    reason: text(raw['reason'], REASON_MAX),
    since: number(raw['since']),
    until: number(raw['until']),
    person: raw['person'] === true,
    note: text(raw['note'], 2_000),
    watches: Array.isArray(raw['watches'])
      ? raw['watches'].flatMap((one) => watchOf(one) ?? [])
      : [],
  }
}

const decisionOf = (raw: unknown): GoalDecision | null => {
  if (!isRecord(raw)) return null

  if (raw['kind'] === 'wait') {
    const wait = storedWaitOf(raw['wait'])

    return wait ? { kind: 'wait', wait } : null
  }

  if (raw['kind'] === 'finish') {
    return {
      kind: 'finish',
      outcome: raw['outcome'] === 'failed' ? 'failed' : 'done',
      report: text(raw['report'], 16_000),
    }
  }

  return null
}

const eventOf = (raw: unknown): GoalEvent[] => {
  if (!isRecord(raw)) return []

  const kind = EVENT_KINDS.find((one) => one === raw['kind'])

  return kind
    ? [
        {
          at: number(raw['at']),
          kind,
          text: text(raw['text'], 1_000),
          costUsd: number(raw['costUsd']),
        },
      ]
    : []
}

/** Жизнь поручения с диска; чужое и битое - значением по умолчанию, без id - мимо. */
export const lifeOf = (raw: unknown): GoalLife | null => {
  if (!isRecord(raw) || typeof raw['runId'] !== 'string' || typeof raw['taskId'] !== 'string') {
    return null
  }

  return {
    runId: raw['runId'],
    taskId: raw['taskId'],
    since: number(raw['since']),
    journal: text(raw['journal'], JOURNAL_MAX),
    wait: storedWaitOf(raw['wait']),
    decided: decisionOf(raw['decided']),
    chapters: Array.isArray(raw['chapters'])
      ? raw['chapters'].filter((one): one is string => typeof one === 'string').slice(-50)
      : [],
    contextTokens: number(raw['contextTokens']),
    checksUsd: number(raw['checksUsd']),
    wakeDay: text(raw['wakeDay'], 10),
    wakesToday: number(raw['wakesToday']),
    retries: number(raw['retries']),
    events: Array.isArray(raw['events']) ? raw['events'].flatMap(eventOf).slice(-EVENTS_KEPT) : [],
  }
}

/** Новая жизнь поручения: журнал пуст, работает. */
export const newLife = (runId: string, taskId: string, now: number): GoalLife => ({
  runId,
  taskId,
  since: now,
  journal: '',
  wait: null,
  decided: null,
  chapters: [],
  contextTokens: 0,
  checksUsd: 0,
  wakeDay: '',
  wakesToday: 0,
  retries: 0,
  events: [{ at: now, kind: 'started', text: '', costUsd: 0 }],
})

/** Событие в историю: новые в конце, старые уходят за пределом. */
export const withEvent = (
  life: GoalLife,
  kind: GoalEventKind,
  said: string,
  now: number,
  costUsd = 0,
): GoalLife => ({
  ...life,
  events: [...life.events, { at: now, kind, text: said.slice(0, 1_000), costUsd }].slice(
    -EVENTS_KEPT,
  ),
})

const minutesArg = (value: unknown, fallback: number, min: number): number => {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ArgumentError('"every_minutes" must be a number')
  }

  return Math.min(MAX_EVERY_MIN, Math.max(min, Math.round(value)))
}

const listArg = (
  args: Record<string, unknown>,
  key: string,
  max: number,
): Record<string, unknown>[] => {
  const value = args[key]

  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new ArgumentError(`"${key}" must be a list of objects`)
  }

  if (value.length > max) throw new ArgumentError(`"${key}" takes at most ${max} items`)

  return value
}

const blankWatch = (
  patch: Partial<GoalWatch> & Pick<GoalWatch, 'kind' | 'everyMin'>,
  now: number,
) => ({
  id: randomUUID(),
  server: '',
  tool: '',
  args: {},
  instructions: '',
  expect: '',
  nextAt: now,
  lastAt: 0,
  changedAt: now,
  hash: '',
  seen: '',
  failures: 0,
  lastError: '',
  ...patch,
})

const toolWatchOf = (raw: Record<string, unknown>, now: number): GoalWatch => {
  const server = text(raw['server'], 80).trim()
  const tool = text(raw['tool'], 160).trim()
  const args = raw['args'] ?? {}

  if (!SERVER_NAME.test(server))
    throw new ArgumentError('watch "server" is a connector server name like gmail-work')
  if (!TOOL_NAME.test(tool))
    throw new ArgumentError('watch "tool" is the tool name as the server lists it')
  if (!isRecord(args)) throw new ArgumentError('watch "args" must be an object')
  if (JSON.stringify(args).length > ARGS_MAX) throw new ArgumentError('watch "args" are too long')

  return blankWatch(
    {
      kind: 'tool',
      server,
      tool,
      args,
      expect: text(raw['expect'], EXPECT_MAX).trim(),
      everyMin: minutesArg(raw['every_minutes'], DEFAULT_TOOL_EVERY_MIN, MIN_TOOL_EVERY_MIN),
    },
    now,
  )
}

const lookWatchOf = (raw: Record<string, unknown>, now: number): GoalWatch => {
  const instructions = text(raw['instructions'], INSTRUCTIONS_MAX).trim()

  if (!instructions) throw new ArgumentError('look "instructions" say what to check and where')

  return blankWatch(
    {
      kind: 'look',
      instructions,
      expect: text(raw['expect'], EXPECT_MAX).trim(),
      everyMin: minutesArg(raw['every_minutes'], DEFAULT_LOOK_EVERY_MIN, MIN_LOOK_EVERY_MIN),
    },
    now,
  )
}

/** Срок сна: ISO во времени человека, как у notify; ошибку модель читает про своё поле. */
const untilOf = (said: string, now: number): number => {
  try {
    return parseWhen(said, now)
  } catch (error) {
    if (error instanceof NoticeError) {
      throw new ArgumentError(error.message.replaceAll('"at"', '"until"'))
    }

    throw error
  }
}

/**
 * Аргументы инструмента wait - сон, проверенный по форме: причина есть, срок - ISO во времени
 * человека, сторожей не больше горсти, есть хоть что-то, что разбудит. Есть ли такой сервер и
 * инструмент в проекте, проверяет стол поручений: это знают только коннекторы.
 */
export const waitOf = (args: Record<string, unknown>, now: number): GoalWait => {
  const reason = text(args['reason'], REASON_MAX).replace(/\s+/g, ' ').trim()

  if (!reason) throw new ArgumentError('"reason" says in one line what you are waiting for')

  const until = untilOf(text(args['until'], 64), now)

  const watches = [
    ...listArg(args, 'watch', TOOL_WATCHES_MAX).map((raw) => toolWatchOf(raw, now)),
    ...listArg(args, 'look', LOOK_WATCHES_MAX).map((raw) => lookWatchOf(raw, now)),
  ]
  const person = args['person'] === true

  if (!until && !person && watches.length === 0) {
    throw new ArgumentError('Say what wakes you: watch, look, until or person: true')
  }

  return { reason, since: now, until, person, watches, note: '' }
}
