import { DEFAULT_GOAL } from '@shared/goals'
import type { TaskAuthored } from '@shared/task-author'
import { nextDue } from '@shared/task-clock'
import { TASK_KINDS } from '@shared/tasks'

import { AUTHOR_OUTBOUNDS } from './task-author-brief'
import { goalOf, NAME_MAX, PROMPT_MAX, scheduleOf } from './task-parse'

/** Будни: weekly без дней не бывает, а «по будням» - самый частый ответ на «каждый день». */
const WORK_DAYS = [1, 2, 3, 4, 5]

/** Время без ответа модели - девять утра, как у новой формы. */
const DEFAULT_AT = 9 * 60

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const words = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

/** «09:30» - минуты от полуночи; не время - null. */
const minutesOf = (value: unknown): number | null => {
  const match = typeof value === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(value.trim()) : null
  const hours = Number(match?.[1])
  const minutes = Number(match?.[2])

  return match && hours < 24 && minutes < 60 ? hours * 60 + minutes : null
}

const pad = (value: number) => String(value).padStart(2, '0')

const dayOf = (at: Date) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`

/**
 * Разовый без дня или с прошедшим сроком - ближайший такой час: сегодня, если он ещё впереди,
 * иначе завтра (днём календаря, а не плюс сутки: переход на летнее время сдвинул бы час). Форма
 * со сроком в прошлом не сохранится, а человек просил «в 18:00», а не дату.
 */
const onceDate = (date: string, at: number, now: Date): string => {
  if (date && nextDue({ repeat: 'once', at, days: [], monthDay: 1, date }, now.getTime()) > 0)
    return date

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, at)
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  return dayOf(today.getTime() > now.getTime() ? today : tomorrow)
}

/**
 * Ответ модели - в задание для формы. Чужое и битое поле - значением по умолчанию, а не отказом:
 * человек всё равно увидит форму перед сохранением. Без имени или текста задания нет - null.
 * Отправку людям без кнопки (free) модель выбрать не может: её даёт только человек.
 */
export const authoredTask = (output: unknown, now: Date): TaskAuthored | null => {
  if (!isRecord(output)) return null

  const name = words(output['name'], NAME_MAX)
  const prompt = words(output['prompt'], PROMPT_MAX)

  if (!name || !prompt) return null

  const kind = TASK_KINDS.find((one) => one === output['kind']) ?? 'schedule'
  const at = minutesOf(output['time']) ?? DEFAULT_AT
  const parsed = scheduleOf({
    ...output,
    at,
    repeat: kind === 'goal' ? 'manual' : output['repeat'],
  })
  const schedule = {
    ...parsed,
    days: parsed.days.length > 0 ? parsed.days : WORK_DAYS,
    date: parsed.repeat === 'once' ? onceDate(parsed.date, at, now) : '',
  }
  const goal = goalOf(output)

  return {
    kind,
    name,
    prompt,
    schedule,
    catchUp: output['catchUp'] !== false,
    report: output['report'] !== false,
    goal: {
      ...goal,
      outbound: AUTHOR_OUTBOUNDS.find((one) => one === goal.outbound) ?? DEFAULT_GOAL.outbound,
    },
  }
}
