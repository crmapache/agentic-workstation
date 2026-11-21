import type { Scenario } from '@shared/scenarios'
import type { TrackerRepeat, TrackerScenario } from '@shared/tracker'
import { TRACKER_REPEAT_MAX } from '@shared/tracker'
import { defaultInputValue } from '@shared/tracker-text'

import { WORK_WEEK, REPEAT_PRESETS } from '../tracker.constants'
import type { RepeatPreset } from '../tracker.types'
import { startWeekday } from '../tracker.utils'
import type { CardForm } from './CardModal.types'

/**
 * Привязка к выбранному сценарию: поля - его объявленные, значение поля с тем же именем
 * сохраняется, новое поле получает значение по умолчанию (первое - вся карточка).
 */
export const bindScenario = (
  scenario: Scenario,
  previous: TrackerScenario | null,
): TrackerScenario => ({
  scenarioId: scenario.id,
  scope: scenario.scope,
  provider: previous?.provider ?? null,
  inputs: Object.fromEntries(
    scenario.inputs
      .filter((input) => input.name.trim())
      .map((input, index) => [
        input.name,
        previous?.inputs[input.name] ?? defaultInputValue(index),
      ]),
  ),
})

/** Объявленные поля сценария привязки - в порядке вопросов сценария. */
export const inputsOf = (scenario: Scenario | null) =>
  (scenario?.inputs ?? []).filter((input) => input.name.trim())

/** Поля, отличные от снимка открытия; срок и сценарий сравниваются по содержимому. */
export const changedFields = (opened: CardForm, now: CardForm): Partial<CardForm> =>
  Object.fromEntries(
    (Object.keys(now) as (keyof CardForm)[]).flatMap((key) =>
      JSON.stringify(now[key]) === JSON.stringify(opened[key]) ? [] : [[key, now[key]]],
    ),
  )

/** День недели начала правила - день недельного повтора, пока человек не выбрал свои. */
export const startWeekdays = (repeat: TrackerRepeat): number[] => {
  const day = startWeekday(repeat.start)

  return day === null ? [] : [day]
}

/** Правило пресета от дня date (`YYYY-MM-DD`): с него оно и начинается. */
export const presetRepeat = (preset: RepeatPreset, date: string): TrackerRepeat => {
  const rule = { every: 1, weekdays: [], start: date, fromDone: false }

  switch (preset) {
    case 'daily':
      return { ...rule, unit: 'day' }
    case 'weekdays':
      return { ...rule, unit: 'week', weekdays: [...WORK_WEEK] }
    case 'weekly':
      return { ...rule, unit: 'week', weekdays: startWeekdays({ ...rule, unit: 'week' }) }
    case 'monthly':
      return { ...rule, unit: 'month' }
    case 'yearly':
      return { ...rule, unit: 'year' }
  }
}

/** Одно ли правило: начало сравнивается, только где от него зависит день (месяц и год). */
export const sameRepeat = (a: TrackerRepeat, b: TrackerRepeat): boolean =>
  a.every === b.every &&
  a.unit === b.unit &&
  a.fromDone === b.fromDone &&
  a.weekdays.join() === b.weekdays.join() &&
  (a.unit === 'day' || a.unit === 'week' || a.start === b.start)

/**
 * Какой пресет у правила от дня date; null - своё правило. Неделя с одним днём - всегда «Every
 * week on …», какой бы день ни был: правило «каждый понедельник» от ИИ у карточки, заведённой в
 * среду, не превращается в «Custom».
 */
export const presetOf = (repeat: TrackerRepeat, date: string): RepeatPreset | null =>
  repeat.unit === 'week' && repeat.every === 1 && !repeat.fromDone && repeat.weekdays.length === 1
    ? 'weekly'
    : (REPEAT_PRESETS.find((preset) => sameRepeat(repeat, presetRepeat(preset, date))) ?? null)

/** «Каждые N» из поля: целое от 1 до потолка; не число - null. */
export const everyOf = (text: string): number | null => {
  const value = Number(text.trim())

  return Number.isInteger(value) && value >= 1 && value <= TRACKER_REPEAT_MAX ? value : null
}

/**
 * Правило пункта меню повтора: у пункта текущего пресета (kept) - само правило с его началом,
 * иначе выбор «того же» молча переписал бы правило на 31-е числом нынешнего срока; у остальных -
 * от срока.
 */
export const menuRule = (
  preset: RepeatPreset,
  kept: { preset: RepeatPreset; repeat: TrackerRepeat } | null,
  date: string,
): TrackerRepeat => (kept?.preset === preset ? kept.repeat : presetRepeat(preset, date))

/** Что сказать под переключателем запуска в срок: ключ `tracker.autoRun.*`. */
export type AutoRunHint = 'needsDue' | 'failed' | 'done' | 'sent' | 'passed' | 'hint'

/**
 * Подсказка запуска в срок по порядку важности: без срока запускать нечего, прошлый отказ,
 * сделанная карточка не уходит, на этот срок уже уходила, прошедший срок уйдёт сразу, иначе -
 * когда уйдёт.
 */
export const autoRunHint = (state: {
  hasDue: boolean
  failed: boolean
  done: boolean
  sent: boolean
  passed: boolean
}): AutoRunHint =>
  !state.hasDue
    ? 'needsDue'
    : state.failed
      ? 'failed'
      : state.done
        ? 'done'
        : state.sent
          ? 'sent'
          : state.passed
            ? 'passed'
            : 'hint'
