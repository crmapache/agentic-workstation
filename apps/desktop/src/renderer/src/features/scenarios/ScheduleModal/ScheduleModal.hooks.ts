import { useState } from 'react'

import type { ProviderId } from '@shared/providers'
import { answersOf, isRunnable, missingInputs } from '@shared/scenario-rules'
import type { Scenario } from '@shared/scenarios'

import type { ScheduledHour } from '../scenarios-hours.utils'
import { useScenarioActions } from '../scenarios.actions'
import { useScenariosStore } from '../scenarios.store'
import { useProviders, effectiveProvider } from '../../../state/providers.queries'
import type { ScheduleFormProps } from './ScheduleModal.types'
import { scenarioOf } from './ScheduleModal.utils'

/**
 * Окно часа (WhenForm в ACC): что набрано и «Set the time». Набранное - в самом окне: форма
 * короткая, и ушедшая вместе с видом теряет минуту, а не ночь работы. Сохраняет главный
 * процесс; отказ встаёт уведомлением, окно остаётся открытым с набранным.
 */
export const useScheduleForm = ({ project, request, scenarios, initial }: ScheduleFormProps) => {
  const actions = useScenarioActions()
  const close = useScenariosStore((store) => store.close)
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const scenario = scenarioOf(scenarios, form.scenario)
  const providers = useProviders().data ?? []
  // Пока человек не выбрал сам - провайдер сценария, если он на месте, иначе первый на месте.
  const provider = effectiveProvider(providers, form.provider, scenario?.head.provider ?? null)
  const isMissing = scenario ? missingInputs(scenario, form.values).length > 0 : true
  const canSave =
    scenario !== null &&
    isRunnable(scenario) &&
    !isMissing &&
    provider?.available === true &&
    !saving

  const save = async () => {
    if (!scenario || !provider || !canSave) return

    setSaving(true)

    const ok = await actions.schedule(project.id, {
      scenarioId: scenario.id,
      scope: scenario.scope,
      scheduleId: request.scheduleId ?? '',
      at: form.hour.at,
      repeat: form.hour.repeat,
      weekday: form.hour.weekday,
      inputs: answersOf(scenario, form.values),
      worktree: form.worktree,
      provider: provider.id,
    })

    setSaving(false)

    if (ok && useScenariosStore.getState().modal?.kind === 'schedule') close()
  }

  return {
    form,
    scenario,
    provider,
    canSave,
    close,
    save: () => void save(),
    // Другой сценарий - другие вопросы: ответы прежнего ему не подходят.
    pickScenario: (next: Scenario) =>
      setForm((now) => ({ ...now, scenario: { id: next.id, scope: next.scope }, values: {} })),
    setHour: (hour: ScheduledHour) => setForm((now) => ({ ...now, hour })),
    setValues: (values: Record<string, string>) => setForm((now) => ({ ...now, values })),
    setWorktree: (worktree: boolean) => setForm((now) => ({ ...now, worktree })),
    setProvider: (provider: ProviderId) => setForm((now) => ({ ...now, provider })),
  }
}
