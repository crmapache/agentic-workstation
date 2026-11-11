import type { GitChanges } from '@shared/git'
import type { ProviderInfo } from '@shared/providers'
import type { ScenarioQueue, ScenarioStartOutcome } from '@shared/scenario-queues'
import type { Scenario, ScenarioInput } from '@shared/scenarios'

import type { LaunchWhere, ScenarioPick, LaunchFailure, LaunchRequest } from './LaunchModal.types'

/**
 * Арифметика окна запуска: какой сценарий выбран, кто провайдер по умолчанию, куда ставить,
 * что сказать про незакоммиченное и почему не вышло.
 */

/** Сценарий, с которым окно открыли (Run на строке полки); полку не назвали - проектная. */
export const initialPick = (request: LaunchRequest): ScenarioPick | null =>
  request.scenarioId ? { id: request.scenarioId, scope: request.scope ?? 'project' } : null

/** Куда ставить сначала: «Add scenario» на полосе очереди - в неё, иначе - новая очередь. */
export const initialWhere = (request: LaunchRequest): LaunchWhere =>
  request.queueId ? { kind: 'queue', queueId: request.queueId } : { kind: 'new' }

/** Сценарий по выбору: по id и полке, а на этой полке нет - по id на любой (полку не назвали). */
export const findScenario = (
  scenarios: readonly Scenario[],
  pick: ScenarioPick | null,
): Scenario | null => {
  if (!pick) return null

  return (
    scenarios.find((one) => one.id === pick.id && one.scope === pick.scope) ??
    scenarios.find((one) => one.id === pick.id) ??
    null
  )
}

/** Полки по отдельности, каждая в своём порядке: так их показывает Library. */
export const shelvesOf = (
  scenarios: readonly Scenario[],
): { project: Scenario[]; user: Scenario[] } => ({
  project: scenarios.filter((one) => one.scope === 'project'),
  user: scenarios.filter((one) => one.scope === 'user'),
})

/** Вопросы, которые задают: безымянный в промпт не вписать (так же считает missingInputs). */
export const askedInputs = (scenario: Scenario): ScenarioInput[] =>
  scenario.inputs.filter((input) => input.name.trim())

/** Провайдер по умолчанию: первый, что на месте, иначе первый - пусть скажет, почему его нет. */
export const defaultProvider = (providers: readonly ProviderInfo[]): ProviderInfo | null =>
  providers.find((one) => one.available) ?? providers[0] ?? null

/** «Куда» на сейчас: выбранная очередь закрылась или ещё не пришла - новая очередь. */
export const currentWhere = (where: LaunchWhere, queues: readonly ScenarioQueue[]): LaunchWhere =>
  where.kind === 'queue' && !queues.some((queue) => queue.id === where.queueId)
    ? { kind: 'new' }
    : where

/** Сколько файлов проекта не закоммичено: их в новом worktree не будет. Неизвестно - ноль. */
export const uncommittedCount = (changes: GitChanges | undefined): number =>
  changes?.kind === 'listed' ? changes.files.length : 0

/** Почему не встало - код главного процесса, а исключение вызова - «неизвестно». */
export const launchFailure = (
  outcome: ScenarioStartOutcome | undefined,
  isError: boolean,
): LaunchFailure | null => {
  if (outcome && !outcome.ok) return { code: outcome.code, detail: outcome.detail ?? '' }

  return isError ? { code: 'unknown', detail: '' } : null
}
