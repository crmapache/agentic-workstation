import type { LucideIcon } from 'lucide-react'

import type { ModelInfo } from '@shared/claude'
import type { ScenarioProblem } from '@shared/scenario-rules'
import type {
  CardSlot,
  Scenario,
  HeadSettings,
  ScenarioCard,
  ScenarioInput,
  ScenarioStage,
} from '@shared/scenarios'

import type { EditorPlace } from '../scenarios-editor.utils'
import type { ScenariosModal } from '../scenarios.types'
import type { ScenariosProject } from '../ScenariosView/ScenariosView.types'

export type EditorModalProps = {
  project: ScenariosProject
  request: Extract<ScenariosModal, { kind: 'editor' }>
}

/** Правка черновика: новый сценарий из того, что лежит в сторе в эту секунду. */
export type DraftChange = (change: (draft: Scenario) => Scenario) => void

export type StageChange = (change: (stage: ScenarioStage) => ScenarioStage) => void

export type CardChange = (change: (card: ScenarioCard) => ScenarioCard) => void

/** На чём идёт голова или карточка: пусто - как новый чат (голова) или как голова (карточка). */
export type RunsOnValue = Pick<ScenarioCard, 'model' | 'effort' | 'permissionMode'>

/** Чьё «пусто» у RunsOn: голова наследует новый чат, карточка - голову. */
export type RunsOnFallback = 'newTab' | 'head'

/** Тон слова режима: насколько свободно действует модель. */
export type ModeTone = 'quiet' | 'info' | 'accent' | 'danger'

/** Вариант селектора: id - значение в сценарии, подпись и пояснение - для меню. */
export type PickerOption = {
  id: string
  label: string
  description?: string | undefined
  icon?: LucideIcon | undefined
}

export type EditorFooterProps = {
  problems: readonly ScenarioProblem[]
  /** Сценарий ещё не на полке: «Discard», а не «Cancel». */
  fresh: boolean
  saving: boolean
  refusal: string
  onCancel: () => void
  onSave: () => void
}

export type EditorOutlineProps = {
  draft: Scenario
  at: EditorPlace
  problems: readonly ScenarioProblem[]
  onPlace: (at: EditorPlace) => void
  onAddStage: () => void
}

export type OutlineStageProps = {
  stage: ScenarioStage
  number: number
  at: EditorPlace
  onPlace: (at: EditorPlace) => void
}

export type OutlineProblemsProps = {
  draft: Scenario
  problems: readonly ScenarioProblem[]
  onPlace: (at: EditorPlace) => void
}

export type EditorPaneProps = {
  draft: Scenario
  at: EditorPlace
  canShare: boolean
  onChange: DraftChange
  onRemoveStage: (stageId: string) => void
}

export type NamePaneProps = { draft: Scenario; canShare: boolean; onChange: DraftChange }

export type HeadPaneProps = {
  head: HeadSettings
  onHead: (patch: Partial<HeadSettings>) => void
}

export type InputsPaneProps = {
  inputs: readonly ScenarioInput[]
  onInputs: (change: (inputs: ScenarioInput[]) => ScenarioInput[]) => void
}

export type InputRowProps = {
  input: ScenarioInput
  onInput: (patch: Partial<ScenarioInput>) => void
  onRemove: () => void
}

export type StagePaneProps = {
  stage: ScenarioStage
  number: number
  total: number
  /** Карточка, на которую указало оглавление: правая часть подводит её к глазам. */
  openCard: string | undefined
  onStage: StageChange
  onMove: (by: number) => void
  onRemove: () => void
}

export type StageRunsProps = { stage: ScenarioStage; onStage: StageChange }

export type CardEditorProps = {
  card: ScenarioCard
  number: number
  first: boolean
  last: boolean
  open: boolean
  onCard: CardChange
  onMove: (by: number) => void
  onCopy: () => void
  onRemove: () => void
}

export type CardHeadProps = Omit<CardEditorProps, 'open' | 'onCard'> & {
  onTitle: (title: string) => void
}

export type SlotRowsProps = {
  slots: readonly CardSlot[]
  onSlots: (change: (slots: CardSlot[]) => CardSlot[]) => void
}

export type PromptFieldProps = {
  id: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}

export type LongFieldProps = {
  label: string
  /** Тише подписи в той же строке: зачем это поле. */
  aside?: string | undefined
  value: string
  placeholder: string
  /** Под полем мелко. */
  note?: string | undefined
  onChange: (value: string) => void
}

export type ChoicePickerProps = {
  /** Подпись капсом перед значением, как MODEL под полем ввода. */
  caption: string
  menuLabel: string
  value: string
  options: readonly PickerOption[]
  tone?: ModeTone | undefined
  onPick: (id: string) => void
}

export type ModelChoiceProps = {
  value: string
  /** Пункт «пусто» - как новый чат или как голова. */
  fallback: PickerOption
  onPick: (model: string) => void
}

export type RunsOnProps = {
  value: RunsOnValue
  fallback: RunsOnFallback
  onChange: (patch: Partial<RunsOnValue>) => void
}

/** Модели провайдера: каталог CLI и свои, добавленные человеком в настройках панели. */
export type ModelCatalog = { catalog: readonly ModelInfo[]; custom: readonly string[] }

/** Меню MODEL по группам: основные сразу, старые версии - в свёрнутой группе, свои - следом. */
export type ModelMenu = { main: PickerOption[]; older: PickerOption[]; custom: PickerOption[] }
