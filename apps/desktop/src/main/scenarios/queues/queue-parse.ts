import { isProviderId } from '@shared/providers'
import type {
  QueueHold,
  QueueItem,
  QueueWorkdir,
  ScenarioQueue,
  QueueItemState,
} from '@shared/scenario-queues'

import { scopeOf } from '../store/scenario-parse'

/**
 * Очереди с диска - каждое поле проверено: файл мог записать старый или чужой выпуск IDE,
 * мог оборваться. Непонятная очередь пропускается целиком, а не роняет остальные.
 */

const STATES: readonly QueueItemState[] = ['waiting', 'running', 'done', 'failed', 'stopped']
const HOLDS = ['stopAfter', 'failed', 'refused', 'interrupted'] as const
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

const parseItem = (value: unknown): QueueItem | null => {
  if (!isRaw(value) || !text(value.id) || !text(value.scenarioId)) return null

  return {
    id: text(value.id),
    scenarioId: text(value.scenarioId),
    scope: scopeOf(text(value.scope)),
    scenarioName: text(value.scenarioName),
    inputs: answers(value.inputs),
    provider: isProviderId(value.provider) ? value.provider : 'claude',
    afterSuccess: value.afterSuccess !== false,
    addedAt: count(value.addedAt),
    runId: text(value.runId),
    state: oneOf(value.state, STATES, 'waiting'),
    // Причина отказа - код окна; старый код, которого окно не знает, покажется общим текстом.
    refusal: (text(value.refusal) || null) as QueueItem['refusal'],
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

export const parseQueue = (value: unknown): ScenarioQueue | null => {
  if (!isRaw(value) || !text(value.id) || !text(value.projectPath)) return null

  const items = Array.isArray(value.items)
    ? value.items.map(parseItem).filter((item): item is QueueItem => item !== null)
    : []

  return {
    id: text(value.id),
    projectPath: text(value.projectPath),
    name: text(value.name) || 'Queue',
    nameSource: oneOf(value.nameSource, NAME_SOURCES, 'fallback'),
    createdAt: count(value.createdAt),
    closedAt: count(value.closedAt),
    workdir: parseWorkdir(value.workdir),
    items,
    stopAfterItemId: text(value.stopAfterItemId),
    hold: parseHold(value.hold),
    acknowledgedItemId: text(value.acknowledgedItemId),
  }
}

export type StoredQueues = { version: 1; queues: ScenarioQueue[] }

export const parseStoredQueues = (value: unknown): ScenarioQueue[] =>
  isRaw(value) && Array.isArray(value.queues)
    ? value.queues.map(parseQueue).filter((queue): queue is ScenarioQueue => queue !== null)
    : []
