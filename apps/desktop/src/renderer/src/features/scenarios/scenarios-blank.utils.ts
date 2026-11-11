import type {
  CardSlot,
  Scenario,
  StageEach,
  ScenarioCard,
  ScenarioInput,
  ScenarioScope,
  ScenarioStage,
} from '@shared/scenarios'
import { SCENARIO_VERSION } from '@shared/scenarios'

/** Пустые части сценария для редактора (blank.ts в ACC): свои id - имена файла и ключи шагов. */

const freshId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const blankCard = (): ScenarioCard => ({
  id: freshId(),
  title: '',
  prompt: '',
  slots: [],
  dod: '',
  after: '',
  model: '',
  effort: '',
  permissionMode: '',
})

export const blankSlot = (): CardSlot => ({ id: freshId(), name: '', description: '' })

export const blankInput = (): ScenarioInput => ({
  id: freshId(),
  name: '',
  label: '',
  placeholder: '',
  required: false,
})

/** Имя пункта этапа «по пункту» по умолчанию - в промптах `[[item]]`. */
export const ITEM_NAME = 'item'

export const blankEach = (): StageEach => ({ name: ITEM_NAME, description: '' })

export const blankStage = (title: string): ScenarioStage => ({
  id: freshId(),
  title,
  repeat: 1,
  untilDone: false,
  cards: [blankCard()],
})

/**
 * Пустой сценарий «соберу сам»: один этап с одной карточкой. id пустой - его даёт главный
 * процесс при первом сохранении, и по пустому id окно знает, что сценарий ещё не на полке.
 */
export const blankScenario = (
  name: string,
  stageTitle: string,
  scope: ScenarioScope,
): Scenario => ({
  version: SCENARIO_VERSION,
  id: '',
  name,
  createdAt: 0,
  updatedAt: 0,
  inputs: [],
  head: {
    briefing: '',
    model: '',
    effort: '',
    permissionMode: 'default',
    onQuestion: 'head',
    retries: 2,
    onGiveUp: 'stop',
  },
  stages: [blankStage(stageTitle)],
  scope,
})

const isBlankCard = (card: ScenarioCard): boolean =>
  !card.title.trim() &&
  !card.prompt.trim() &&
  !card.dod.trim() &&
  !card.after.trim() &&
  card.slots.length === 0

/**
 * Новый сценарий, в котором человек ещё ничего не написал: ни имени, ни брифинга, ни вопроса,
 * ни слова в карточках. Закрыть такой - ничего не потерять; названия этапов не в счёт - их
 * подставляет сам редактор.
 */
export const isUntouched = (draft: Scenario): boolean =>
  !draft.name.trim() &&
  !draft.head.briefing.trim() &&
  draft.inputs.length === 0 &&
  draft.stages.every((stage) => !stage.each && stage.cards.every(isBlankCard))
