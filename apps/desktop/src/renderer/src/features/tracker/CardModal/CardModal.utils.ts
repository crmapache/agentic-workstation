import type { Scenario } from '@shared/scenarios'
import type { TrackerScenario } from '@shared/tracker'
import { defaultInputValue } from '@shared/tracker-text'

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
