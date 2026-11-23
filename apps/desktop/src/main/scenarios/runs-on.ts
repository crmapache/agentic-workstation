import type { RunsOn } from '@shared/scenario-queues'
import type { Scenario, ScenarioCard } from '@shared/scenarios'

import type { ScenarioProvider } from '../providers/scenario-provider'

/**
 * На чём идут сессии прогона - одними правилами для движка (что он поднимает) и для очереди (что
 * она показывает): пустое у карточки - как у головы, пустое у головы - как у новой вкладки
 * провайдера. Чистые функции - держит тест.
 */

/** Модель и усилие новой вкладки провайдера - на них идут пустые поля сценария. */
export type RunDefaults = { model: string; effort: string }

/** Голова прогона: своё или новой вкладки. */
export const headRunsOn = (scenario: Scenario, defaults: RunDefaults): RunsOn => ({
  model: scenario.head.model || defaults.model,
  effort: scenario.head.effort || defaults.effort,
})

/** Карточка: своё, иначе головы, иначе новой вкладки. */
export const cardRunsOn = (
  card: ScenarioCard,
  scenario: Scenario,
  defaults: RunDefaults,
): RunsOn => ({
  model: card.model || scenario.head.model || defaults.model,
  effort: card.effort || scenario.head.effort || defaults.effort,
})

/**
 * Все сессии сценария у провайдера - разными парами по порядку, голова первой: так их видно на
 * строке очереди. Провайдер правит пару, как правит её при запуске (чужая модель - его модель по
 * умолчанию); провайдера нет - как в сценарии, пустое - пустым.
 */
export const runsOnOf = (
  scenario: Scenario,
  provider: Pick<ScenarioProvider, 'defaults' | 'fitRunsOn'> | null,
): RunsOn[] => {
  const defaults = provider?.defaults() ?? { model: '', effort: '' }
  const fit = provider?.fitRunsOn ?? ((choice: RunsOn) => choice)
  const sessions = [
    headRunsOn(scenario, defaults),
    ...scenario.stages.flatMap((stage) =>
      stage.cards.map((card) => cardRunsOn(card, scenario, defaults)),
    ),
  ].map(fit)

  return sessions.filter(
    (one, index) =>
      sessions.findIndex((other) => other.model === one.model && other.effort === one.effort) ===
      index,
  )
}
