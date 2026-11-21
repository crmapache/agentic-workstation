import type { Scenario } from '@shared/scenarios'
import type { TrackerScenario } from '@shared/tracker'
import { defaultInputValue } from '@shared/tracker-text'

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
