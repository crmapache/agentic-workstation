import type { ProviderId } from '@shared/providers'
import { UNATTENDED_PROVIDER_IDS } from '@shared/providers'
import { DAY_MINUTES } from '@shared/queue-hours'
import type { QueueHours, QueueAction, QueueTarget, WorktreeAction } from '@shared/scenario-queues'
import type { ScenarioRunControl, ScenarioHourRequest } from '@shared/scenario-view'
import { SCENARIO_REPEATS } from '@shared/scenarios'
import type { RunPlace } from '@shared/ipc/scenarios.contract'

import { assertOneOf, assertString } from './validate'

/** Проверки запросов области сценариев: окно своё, но граница процессов - граница. */

const asRecord = (value: unknown, name: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Ожидался объект в поле ${name}`)
  }

  return value as Record<string, unknown>
}

/** id очередей, элементов, прогонов и черновиков - короткие и без путей. */
export const assertId = (value: unknown, name: string): string => {
  assertString(value, name)

  if (!/^[A-Za-z0-9_-]{1,80}$/.test(value)) throw new Error(`Недопустимый id в поле ${name}`)

  return value
}

const assertCount = (value: unknown, name: string, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Ожидалось целое число в поле ${name}`)
  }

  return value
}

/** Ответы на вводы сценария: имя - строка, значение - строка, без потолка разумного. */
export const parseInputs = (value: unknown): Record<string, string> => {
  const record = asRecord(value, 'inputs')
  const entries = Object.entries(record)

  if (entries.length > 50) throw new Error('Слишком много ответов')

  return Object.fromEntries(
    entries.map(([name, answer]) => {
      assertString(answer, 'inputs')

      if (answer.length > 20_000) throw new Error('Слишком длинный ответ')

      return [name, answer]
    }),
  )
}

/** Провайдер прогона, задания или сценария: только тот, кому можно работать без человека (ADR 0094). */
export const parseProvider = (value: unknown): ProviderId =>
  assertOneOf(value, UNATTENDED_PROVIDER_IDS, 'provider')

export const parseTarget = (value: unknown): QueueTarget => {
  const record = asRecord(value, 'target')

  if (record.kind === 'new') return { kind: 'new', worktree: record.worktree === true }

  return { kind: 'queue', queueId: assertId(record.queueId, 'queueId') }
}

/** Рабочие часы очереди: минуты в пределах суток, хотя бы один день недели. */
export const parseHours = (value: unknown): QueueHours | null => {
  if (value === null) return null

  const record = asRecord(value, 'hours')

  if (!Array.isArray(record.days) || record.days.length === 0 || record.days.length > 7) {
    throw new Error('Ожидались дни недели в поле days')
  }

  return {
    from: assertCount(record.from, 'from', 0, DAY_MINUTES - 1),
    to: assertCount(record.to, 'to', 0, DAY_MINUTES - 1),
    days: record.days.map((day: unknown) => assertCount(day, 'days', 1, 7)),
  }
}

export const parseQueueAction = (value: unknown): QueueAction => {
  const record = asRecord(value, 'action')
  const kind = assertOneOf(
    record.kind,
    [
      'remove',
      'move',
      'stopAfter',
      'resume',
      'markDone',
      'rename',
      'clear',
      'hours',
      'close',
    ] as const,
    'kind',
  )

  switch (kind) {
    case 'remove':
    case 'markDone':
      return { kind, itemId: assertId(record.itemId, 'itemId') }
    case 'move':
      return {
        kind,
        itemId: assertId(record.itemId, 'itemId'),
        by: assertCount(record.by, 'by', -100, 100),
      }
    case 'stopAfter':
      return { kind, itemId: record.itemId === null ? null : assertId(record.itemId, 'itemId') }
    case 'rename':
      assertString(record.name, 'name')

      return { kind, name: record.name.slice(0, 200) }
    case 'hours':
      return { kind, hours: parseHours(record.hours) }
    case 'resume':
    case 'clear':
    case 'close':
      return { kind }
  }
}

export const parseWorktreeAction = (value: unknown): WorktreeAction => {
  const record = asRecord(value, 'action')

  return assertOneOf(record.kind, ['open', 'remove'] as const, 'kind') === 'open'
    ? { kind: 'open' }
    : { kind: 'remove', force: record.force === true }
}

export const parseRunPlace = (value: unknown): RunPlace => {
  const record = asRecord(value, 'place')

  if (typeof record.queueId === 'string') return { queueId: assertId(record.queueId, 'queueId') }

  assertString(record.projectId, 'projectId')

  return { projectId: record.projectId }
}

export const parseControl = (value: unknown): ScenarioRunControl =>
  assertOneOf(value, ['pause', 'resume', 'stop'] as const, 'action')

export const parseHour = (value: unknown): ScenarioHourRequest => {
  const record = asRecord(value, 'hour')

  assertString(record.scenarioId, 'scenarioId')
  assertString(record.scheduleId, 'scheduleId')

  return {
    scenarioId: record.scenarioId,
    scope: assertOneOf(record.scope, ['project', 'user'] as const, 'scope'),
    scheduleId: record.scheduleId,
    at: assertCount(record.at, 'at', 0, 24 * 60 - 1),
    repeat: assertOneOf(record.repeat, SCENARIO_REPEATS, 'repeat'),
    weekday: assertCount(record.weekday, 'weekday', 1, 7),
    inputs: parseInputs(record.inputs),
    worktree: record.worktree === true,
    provider: parseProvider(record.provider),
  }
}
