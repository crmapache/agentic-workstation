import { SCENARIO_SCOPES } from '@shared/scenarios'
import type { TrackerDue, TrackerCode, TrackerScenario, TrackerCardFields } from '@shared/tracker'
import { TRACKER_LIMITS, TRACKER_PRIORITIES } from '@shared/tracker'

/**
 * Проверка полей правки: то, что пришло из окна или от модели, приводится к виду записи или
 * отказывает кодом. Окну и модели не верим - тип поля проверяется здесь, а не только в схеме.
 */

/** Ошибка правки с кодом для окна и слов MCP. */
export class TrackerError extends Error {
  constructor(readonly code: TrackerCode) {
    super(code)
  }
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_INPUTS = 50

/** Заголовок: обязательный, одной строкой. */
export const titleOf = (value: unknown): string => {
  const title = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''

  if (!title) throw new TrackerError('badTitle')
  if (title.length > TRACKER_LIMITS.title) throw new TrackerError('tooLong')

  return title
}

/** Подзаголовок или описание: может быть пустым. */
export const textOf = (value: unknown, limit: number): string => {
  if (typeof value !== 'string') throw new TrackerError('tooLong')

  const text = value.trim()

  if (text.length > limit) throw new TrackerError('tooLong')

  return text
}

/** Срок: настоящая дата календаря и, если есть, время суток. */
export const dueOf = (value: unknown): TrackerDue | null => {
  if (value === null) return null
  if (typeof value !== 'object') throw new TrackerError('badDue')

  const { date, time } = value as { date?: unknown; time?: unknown }
  const match = typeof date === 'string' ? DATE.exec(date) : null

  if (!match) throw new TrackerError('badDue')

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const real = new Date(year, month - 1, day)

  if (real.getFullYear() !== year || real.getMonth() !== month - 1 || real.getDate() !== day)
    throw new TrackerError('badDue')

  if (time !== null && time !== undefined && (typeof time !== 'string' || !TIME.test(time)))
    throw new TrackerError('badDue')

  return { date: match[0], time: typeof time === 'string' ? time : null }
}

const shortText = (value: unknown, limit: number): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    throw new TrackerError('badScenario')

  return value.trim()
}

/** Сценарий карточки: какой и чем заполнить; null - отвязать. */
export const scenarioOf = (value: unknown): TrackerScenario | null => {
  if (value === null) return null
  if (typeof value !== 'object') throw new TrackerError('badScenario')

  const raw = value as Record<string, unknown>
  const scope = raw.scope ?? 'project'

  if (!(SCENARIO_SCOPES as readonly unknown[]).includes(scope))
    throw new TrackerError('badScenario')

  const inputs: Record<string, string> = {}
  const rawInputs = raw.inputs ?? {}

  if (typeof rawInputs !== 'object' || rawInputs === null || Array.isArray(rawInputs))
    throw new TrackerError('badScenario')

  const pairs = Object.entries(rawInputs)

  // Все поля вместе - не длиннее описания: запись карточки должна влезть в облако одним шифром.
  if (
    pairs.length > MAX_INPUTS ||
    pairs.reduce((sum, [, text]) => sum + String(text).length, 0) > TRACKER_LIMITS.description
  )
    throw new TrackerError('badScenario')

  for (const [name, text] of pairs) {
    if (typeof text !== 'string' || text.length > TRACKER_LIMITS.description)
      throw new TrackerError('badScenario')

    inputs[shortText(name, 100)] = text
  }

  return {
    scenarioId: shortText(raw.scenarioId, 200),
    scope: scope as TrackerScenario['scope'],
    provider:
      raw.provider === null || raw.provider === undefined ? null : shortText(raw.provider, 100),
    inputs,
  }
}

/**
 * Поля карточки из правки: только присланные, каждое проверено. title присылают всегда при
 * создании, при правке - если меняют.
 */
export const cardFieldsOf = (
  fields: Partial<Record<keyof TrackerCardFields, unknown>>,
): Partial<TrackerCardFields> => {
  const out: Partial<TrackerCardFields> = {}

  if (fields.title !== undefined) out.title = titleOf(fields.title)
  if (fields.subtitle !== undefined) out.subtitle = textOf(fields.subtitle, TRACKER_LIMITS.subtitle)
  if (fields.description !== undefined)
    out.description = textOf(fields.description, TRACKER_LIMITS.description)
  if (fields.due !== undefined) out.due = dueOf(fields.due)
  if (fields.priority !== undefined) {
    if (!(TRACKER_PRIORITIES as readonly unknown[]).includes(fields.priority))
      throw new TrackerError('badTitle')

    out.priority = fields.priority as TrackerCardFields['priority']
  }
  if (fields.done !== undefined) out.done = fields.done === true
  if (fields.scenario !== undefined) out.scenario = scenarioOf(fields.scenario)

  return out
}
