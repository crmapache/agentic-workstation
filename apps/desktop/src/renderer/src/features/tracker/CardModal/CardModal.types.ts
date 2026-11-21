import type { Scenario } from '@shared/scenarios'
import type { TrackerDue, TrackerCard, TrackerPriority, TrackerScenario } from '@shared/tracker'

/** Открытая карточка или новая: в какую группу и чьим продолжением. */
export type CardModalProps =
  { mode: 'edit'; card: TrackerCard } | { mode: 'new'; groupId: string; followUpOf: string | null }

/** Поля формы карточки - то, что уйдёт правкой по «Save». */
export type CardForm = {
  title: string
  subtitle: string
  description: string
  due: TrackerDue | null
  priority: TrackerPriority
  done: boolean
  scenario: TrackerScenario | null
}

export type CardFormApi = CardForm & {
  set: <K extends keyof CardForm>(key: K, value: CardForm[K]) => void
}

export type DueFieldsProps = { form: CardFormApi; today: number }

export type PriorityFieldProps = { form: CardFormApi }

export type ScenarioFieldsProps = { form: CardFormApi; scenarios: readonly Scenario[] }

export type ProviderFieldProps = { form: CardFormApi; scenario: Scenario | null }
