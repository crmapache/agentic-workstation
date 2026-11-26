import { isProviderId } from '@shared/providers'
import { cleanHours } from '@shared/queue-hours'
import type {
  RunsOn,
  QueueNap,
  QueueHold,
  QueueItem,
  QueueTurn,
  QueueHours,
  QueueWorkdir,
  ScenarioQueue,
  QueueItemState,
} from '@shared/scenario-queues'

import { scopeOf } from '../store/scenario-parse'

/**
 * Очереди с диска - каждое поле проверено: файл мог записать старый или чужой выпуск IDE,
 * мог оборваться. Непонятная очередь пропускается целиком, а не роняет остальные.
 */

const STATES: readonly QueueItemState[] = [
  'waiting',
  'running',
  'done',
  'failed',
  'stopped',
  'skipped',
]
const HOLDS = ['stopAfter', 'failed', 'refused', 'interrupted'] as const
const TURNS = ['holding', 'waiting'] as const
const NAME_SOURCES = ['fallback', 'ai', 'user'] as const

type Raw = Record<string, unknown>

const isRaw = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.find((option) => option === value) ?? fallback

const answers = (value: unknown): Record<string, string> =>
  isRaw(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {}

const parseRunsOn = (value: unknown): RunsOn[] =>
  isRaw(value) ? [{ model: text(value.model), effort: text(value.effort) }] : []

const parseItem = (value: unknown): QueueItem | null => {
  const placeholder = isRaw(value) && value.placeholder === true

  // У пометки сценария нет - она держится заголовком карточки.
  if (!isRaw(value) || !text(value.id) || (!placeholder && !text(value.scenarioId))) return null

  return {
    id: text(value.id),
    scenarioId: text(value.scenarioId),
    scope: scopeOf(text(value.scope)),
    scenarioName: text(value.scenarioName),
    inputs: answers(value.inputs),
    provider: isProviderId(value.provider) ? value.provider : 'claude',
    addedAt: count(value.addedAt),
    runId: text(value.runId),
    state: oneOf(value.state, STATES, 'waiting'),
    // Причина отказа - код окна; старый код, которого окно не знает, покажется общим текстом.
    refusal: (text(value.refusal) || null) as QueueItem['refusal'],
    ...(Array.isArray(value.runsOn) && { runsOn: value.runsOn.flatMap(parseRunsOn) }),
    ...(value.doneByHand === true && { doneByHand: true }),
    ...(placeholder && { placeholder: true }),
  }
}

const parseWorkdir = (value: unknown): QueueWorkdir => {
  if (!isRaw(value) || value.kind !== 'worktree' || !text(value.path)) return { kind: 'project' }

  return {
    kind: 'worktree',
    path: text(value.path),
    projectDir: text(value.projectDir) || text(value.path),
    gitBranch: text(value.gitBranch),
    baseCommit: text(value.baseCommit),
    removed: value.removed === true,
  }
}

const parseHold = (value: unknown): QueueHold | null =>
  isRaw(value) && HOLDS.some((reason) => reason === value.reason)
    ? {
        reason: oneOf(value.reason, HOLDS, 'interrupted'),
        itemId: text(value.itemId),
        at: count(value.at),
      }
    : null

/** Часы без дней - не часы: окно никогда бы не открылось, и очередь спала бы вечно. */
const parseHours = (value: unknown): QueueHours | null => {
  if (!isRaw(value) || !Array.isArray(value.days)) return null

  const hours = cleanHours({
    from: count(value.from),
    to: count(value.to),
    days: value.days.filter((day): day is number => typeof day === 'number'),
  })

  return hours.days.length > 0 ? hours : null
}

const parseNap = (value: unknown): QueueNap | null =>
  isRaw(value) && count(value.at) > 0
    ? { at: count(value.at), until: count(value.until), runId: text(value.runId) }
    : null

const parseTurn = (value: unknown): QueueTurn | null =>
  isRaw(value) && TURNS.some((kind) => kind === value.kind)
    ? { kind: oneOf(value.kind, TURNS, 'waiting'), at: count(value.at) }
    : null

/**
 * Выпуск до ADR 0128 места у папки не знал. Его открытая очередь без worktree, которая спит без
 * прогона на паузе, хотя будить её пора (часов нет - обход через часы - или срок пробуждения
 * прошёл), - это ожидание папки: будить её не давала занятая папка (folderTaken). Теперь это место
 * в ожидании - с того мига, как она уснула, чтобы такие очереди пошли в том порядке, в каком
 * уснули. Остальным место назначит их первый шаг.
 */
const legacyWait = (
  workdir: QueueWorkdir,
  closedAt: number,
  hours: QueueHours | null,
  nap: QueueNap | null,
): QueueTurn | null =>
  workdir.kind === 'project' &&
  closedAt === 0 &&
  nap &&
  !nap.runId &&
  (!hours || nap.until <= Date.now())
    ? { kind: 'waiting', at: nap.at }
    : null

/**
 * Последнее дело очереди, которую записал выпуск без activeAt: самое позднее, что она о себе
 * помнит, - создание, постановка сценария, остановка.
 */
const lastKnownDeed = (createdAt: number, items: QueueItem[], hold: QueueHold | null): number =>
  Math.max(createdAt, hold?.at ?? 0, ...items.map((item) => item.addedAt))

export const parseQueue = (value: unknown): ScenarioQueue | null => {
  if (!isRaw(value) || !text(value.id) || !text(value.projectPath)) return null

  const items = Array.isArray(value.items)
    ? value.items.map(parseItem).filter((item): item is QueueItem => item !== null)
    : []
  const createdAt = count(value.createdAt)
  const hold = parseHold(value.hold)
  const closedAt = count(value.closedAt)
  const workdir = parseWorkdir(value.workdir)
  // Очередь старого выпуска часов не знала: работает в любое время.
  const hours = parseHours(value.hours)
  const nap = parseNap(value.nap)
  const legacy = value.turn === undefined ? legacyWait(workdir, closedAt, hours, nap) : null

  return {
    id: text(value.id),
    projectPath: text(value.projectPath),
    name: text(value.name) || 'Queue',
    nameSource: oneOf(value.nameSource, NAME_SOURCES, 'fallback'),
    createdAt,
    activeAt: count(value.activeAt) || lastKnownDeed(createdAt, items, hold),
    closedAt,
    workdir,
    items,
    stopAfterItemId: text(value.stopAfterItemId),
    hold,
    hours,
    // Сон обхода закончен: он стал местом в ожидании папки.
    nap: legacy ? null : nap,
    turn: legacy ?? (workdir.kind === 'project' ? parseTurn(value.turn) : null),
  }
}

export type StoredQueues = { version: 1; queues: ScenarioQueue[] }

export const parseStoredQueues = (value: unknown): ScenarioQueue[] =>
  isRaw(value) && Array.isArray(value.queues)
    ? value.queues.map(parseQueue).filter((queue): queue is ScenarioQueue => queue !== null)
    : []
