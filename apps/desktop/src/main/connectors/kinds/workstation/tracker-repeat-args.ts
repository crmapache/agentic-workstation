import type { TrackerCard, TrackerRepeat } from '@shared/tracker'
import { TRACKER_REPEAT_MAX, TRACKER_REPEAT_UNITS } from '@shared/tracker'

import { ArgumentError } from '../native-tools'

/**
 * Повтор и запуск в срок карточки трекера (ADR 0103) словами модели: дни недели - «mon»…«sun»,
 * как их пишут люди, а не номерами. Настоящая ли дата начала - решает правка трекера.
 */

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const REPEAT_KEYS = ['every', 'unit', 'weekdays', 'from_completion', 'start']

/** Повтор из аргумента; null - снять. */
export const repeatArg = (value: unknown): TrackerRepeat | null => {
  if (value === null) return null
  if (typeof value !== 'object' || Array.isArray(value))
    throw new ArgumentError('"repeat" is an object like {"unit": "week", "weekdays": ["mon"]}')

  const raw = value as Record<string, unknown>
  const unknown = Object.keys(raw).filter((key) => !REPEAT_KEYS.includes(key))
  const unit = TRACKER_REPEAT_UNITS.find((one) => one === raw['unit'])
  const every = raw['every'] ?? 1
  const days = raw['weekdays'] ?? []

  if (unknown.length > 0)
    throw new ArgumentError(`"repeat" has no ${unknown.join(', ')}: ${REPEAT_KEYS.join(', ')}`)
  if (!unit) throw new ArgumentError(`"repeat.unit" is ${TRACKER_REPEAT_UNITS.join(', ')}`)
  if (
    typeof every !== 'number' ||
    !Number.isInteger(every) ||
    every < 1 ||
    every > TRACKER_REPEAT_MAX
  )
    throw new ArgumentError(`"repeat.every" is a whole number 1-${TRACKER_REPEAT_MAX}`)
  if (!Array.isArray(days) || days.some((day) => !WEEKDAYS.includes(day as never)))
    throw new ArgumentError(`"repeat.weekdays" is a list of ${WEEKDAYS.join(', ')}`)
  if (raw['from_completion'] !== undefined && typeof raw['from_completion'] !== 'boolean')
    throw new ArgumentError('"repeat.from_completion" is true or false')
  if (raw['start'] !== undefined && typeof raw['start'] !== 'string')
    throw new ArgumentError('"repeat.start" is YYYY-MM-DD')

  return {
    every,
    unit,
    weekdays: days.map((day) => WEEKDAYS.indexOf(day as (typeof WEEKDAYS)[number]) + 1),
    start: typeof raw['start'] === 'string' ? raw['start'] : '',
    fromDone: raw['from_completion'] === true,
  }
}

export const autoRunArg = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw new ArgumentError('"auto_run" must be true or false')

  return value
}

/** Повтор так же, как его принимает repeatArg: что модель прочла, то и пишет. */
export const repeatView = (repeat: TrackerRepeat) => ({
  every: repeat.every,
  unit: repeat.unit,
  ...(repeat.weekdays.length > 0 && {
    weekdays: repeat.weekdays.map((day) => WEEKDAYS[day - 1] ?? ''),
  }),
  start: repeat.start,
  ...(repeat.fromDone && { from_completion: true }),
})

/** Запуск в срок на этом компьютере: включён ли и почему отправка отказала. */
export const autoRunView = (card: TrackerCard) =>
  card.autoRun
    ? { auto_run: true, ...(card.autoRunFailure && { auto_run_failed: card.autoRunFailure }) }
    : {}

/** Схема повтора и запуска в срок - часть схемы полей карточки. */
export const REPEAT_FIELDS_SCHEMA = {
  repeat: {
    type: 'object',
    description:
      'Repeat like Todoist; null stops it. Marking a repeating card done moves its due to the next time instead (done follow-ups reopen). Without a due, it gets the first matching day; a new repeat that the due does not fit moves the due to its next day.',
    properties: {
      unit: { type: 'string', enum: [...TRACKER_REPEAT_UNITS] },
      every: { type: 'number', description: 'Every N units, default 1.' },
      weekdays: {
        type: 'array',
        items: { type: 'string', enum: [...WEEKDAYS] },
        description: 'For unit week: the days. Default: the weekday of the due date.',
      },
      from_completion: {
        type: 'boolean',
        description: 'Count the next time from the day it was done, not from the schedule.',
      },
      start: {
        type: 'string',
        description:
          'YYYY-MM-DD the schedule counts from (day of month, every-other-week). Default: the due date.',
      },
    },
    required: ['unit'],
  },
  auto_run: {
    type: 'boolean',
    description:
      "Run the card's scenario by itself at its due time on this computer (needs a scenario and a due; a due without a time runs at the start of the day). Kept on this computer only.",
  },
}
