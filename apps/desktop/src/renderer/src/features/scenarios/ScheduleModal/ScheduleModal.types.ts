import type { ProviderId, ProviderInfo } from '@shared/providers'
import type { Scenario, ScenarioScope } from '@shared/scenarios'

import type { ScheduledHour } from '../scenarios-hours.utils'
import type { ScenariosModal } from '../scenarios.types'
import type { ScenariosProject } from '../ScenariosView/ScenariosView.types'

export type ScheduleModalProps = {
  project: ScenariosProject
  request: Extract<ScenariosModal, { kind: 'schedule' }>
}

/** Какой сценарий ставится на час: id и полка - двойники на двух полках разные. */
export type ScenarioRef = { id: string; scope: ScenarioScope }

/** Всё, что набрано в окне часа, до «Set the time». */
export type ScheduleFormState = {
  scenario: ScenarioRef | null
  hour: ScheduledHour
  values: Record<string, string>
  worktree: boolean
  provider: ProviderId
}

export type ScheduleFormProps = ScheduleModalProps & {
  scenarios: readonly Scenario[]
  initial: ScheduleFormState
}

export type ScenarioPickerProps = {
  scenarios: readonly Scenario[]
  value: Scenario | null
  onPick: (scenario: Scenario) => void
}

export type HourPickerProps = {
  hour: ScheduledHour
  onChange: (hour: ScheduledHour) => void
}

export type InputFieldsProps = {
  scenario: Scenario
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
}

export type ProviderPickerProps = {
  providers: readonly ProviderInfo[]
  value: ProviderId
  onPick: (provider: ProviderId) => void
}
