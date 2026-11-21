import type { Scenario } from '@shared/scenarios'
import type {
  TrackerDue,
  TrackerCard,
  TrackerRepeat,
  TrackerPriority,
  TrackerScenario,
} from '@shared/tracker'

/** Открытая карточка или новая: в какую группу и чьим продолжением. */
export type CardModalProps =
  { mode: 'edit'; card: TrackerCard } | { mode: 'new'; groupId: string; followUpOf: string | null }

/** Поля формы карточки - то, что уйдёт правкой по «Save». */
export type CardForm = {
  title: string
  subtitle: string
  description: string
  due: TrackerDue | null
  repeat: TrackerRepeat | null
  priority: TrackerPriority
  done: boolean
  scenario: TrackerScenario | null
  autoRun: boolean
}

export type CardFormApi = CardForm & {
  set: <K extends keyof CardForm>(key: K, value: CardForm[K]) => void
  /** Поля, которые человек поменял с открытия окна. */
  changed: () => Partial<CardForm>
  /** Все поля - для новой карточки. */
  all: () => CardForm
}

export type DueFieldsProps = { form: CardFormApi; today: number }

export type PriorityFieldProps = { form: CardFormApi }

export type ScenarioFieldsProps = { form: CardFormApi; scenarios: readonly Scenario[] }

export type ProviderFieldProps = { form: CardFormApi; scenario: Scenario | null }

export type RepeatFieldProps = { form: CardFormApi; today: number; now: number }

/** today - `YYYY-MM-DD`: срок правилу без срока ставится от него. */
export type RepeatCustomProps = { form: CardFormApi; repeat: TrackerRepeat; today: string }

/** card - открытая карточка (null - новая): прошлый отказ и «на этот срок уже уходила». */
export type AutoRunFieldProps = { form: CardFormApi; card: TrackerCard | null; now: number }
