import { PROVIDER_IDS } from '@shared/providers'
import { isRunnable } from '@shared/scenario-rules'
import type { ScenarioShelvesView } from '@shared/scenario-view'
import type { Scenario } from '@shared/scenarios'

import { isoWeekday, defaultHour } from '../scenarios-hours.utils'
import type { ScenarioRef, ScheduleFormState, ScheduleModalProps } from './ScheduleModal.types'

/** Сценарий по ссылке формы; null - не выбран или пропал с полки. */
export const scenarioOf = (
  scenarios: readonly Scenario[],
  ref: ScenarioRef | null,
): Scenario | null =>
  ref ? (scenarios.find((one) => one.id === ref.id && one.scope === ref.scope) ?? null) : null

/** Что можно поставить на час: только то, что запустится, - сломанный час молча упал бы ночью. */
export const schedulable = (scenarios: readonly Scenario[]): Scenario[] =>
  scenarios.filter(isRunnable)

/**
 * С чего открывается окно часа. Правка - ответами, ритмом, worktree и провайдером самой записи:
 * пустая форма стёрла бы их. Новый час - «примерно через час», один раз, в папке проекта.
 */
export const initialForm = (
  request: ScheduleModalProps['request'],
  view: ScenarioShelvesView,
  now: number,
): ScheduleFormState => {
  const existing = view.schedules.find((one) => one.id === request.scheduleId)

  if (existing)
    return {
      scenario: { id: existing.scenarioId, scope: existing.scope },
      hour: { at: existing.at, repeat: existing.repeat, weekday: existing.weekday },
      values: { ...existing.inputs },
      worktree: existing.worktree,
      provider: existing.provider,
    }

  return {
    scenario:
      request.scenarioId && request.scope ? { id: request.scenarioId, scope: request.scope } : null,
    hour: { at: defaultHour(now), repeat: 'once', weekday: isoWeekday(now) },
    values: {},
    worktree: false,
    provider: PROVIDER_IDS[0] ?? 'claude',
  }
}
