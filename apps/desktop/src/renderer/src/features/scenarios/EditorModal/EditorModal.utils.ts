import type { TFunction } from 'i18next'

import type { ModelInfo, PermissionMode } from '@shared/claude'
import { EFFORT_LEVELS, PERMISSION_MODES } from '@shared/claude'
import type { ScenarioProblem } from '@shared/scenario-rules'
import { cardRuns, passesOf, SCENARIO_NAME } from '@shared/scenario-rules'
import type { Scenario, ScenarioStage } from '@shared/scenarios'

import {
  PER_ITEM,
  MODE_ICONS,
  MODE_TONES,
  RUN_COUNTS,
  MAIN_MODELS,
  RETRY_COUNTS,
  SCENARIO_MODES,
  FALLBACK_MODELS,
  DEFAULT_MODEL_VALUE,
  LEGACY_DEFAULT_MODE,
} from './EditorModal.constants'
import type {
  ModeTone,
  ModelMenu,
  ModelCatalog,
  PickerOption,
  RunsOnFallback,
} from './EditorModal.types'

/** Как промпт пишет вопрос сценария: `{{name}}`. */
export const inputMention = (name: string): string => `{{${name}}}`

/** Как промпт пишет слот или пункт списка: `[[name]]`. */
export const slotMention = (name: string): string => `[[${name}]]`

/** Имя набрано, но не годится: пустое не ругаем под полем - о нём скажет список находок. */
export const isBadName = (name: string): boolean => name.length > 0 && !SCENARIO_NAME.test(name)

/** Строка под заголовком окна: полка, этапы и карточки (все проходы), у несохранённого - пометка. */
export const editorSubtitle = (t: TFunction, draft: Scenario, fresh: boolean): string =>
  [
    fresh ? t('scenarios.editor.unsaved') : '',
    draft.scope === 'project'
      ? t('scenarios.editor.inRepository')
      : t('scenarios.editor.everyProject'),
    t('scenarios.editor.stages', { count: draft.stages.length }),
    t('scenarios.editor.cards', { count: cardRuns(draft) }),
  ]
    .filter(Boolean)
    .join(' · ')

/**
 * Как ходит этап - словами: коротко под именем в оглавлении, полнее над этапом. Один проход
 * ничего не говорит: так ходит почти каждый этап, и слово при каждом было бы шумом.
 */
export const stageNote = (t: TFunction, stage: ScenarioStage, short: boolean): string => {
  const count = passesOf(stage)

  if (stage.each)
    return short ? t('scenarios.editor.outline.perItem') : t('scenarios.editor.stage.perItem')
  if (count < 2) return ''
  if (stage.untilDone)
    return short
      ? t('scenarios.editor.outline.roundsUntil', { count })
      : t('scenarios.editor.stage.goesRoundUntil', { count })

  return short
    ? t('scenarios.editor.outline.rounds', { count })
    : t('scenarios.editor.stage.goesRound', { count })
}

/** Пустое имя - своими словами: «"" is not a name» читается как поломка редактора. */
const unnamedKey = (problem: ScenarioProblem) => {
  if (problem.name !== '') return null
  if (problem.kind === 'badInputName') return 'unnamedInput' as const
  if (problem.kind === 'badSlotName') return 'unnamedSlot' as const
  if (problem.kind === 'badItemName') return 'unnamedItem' as const

  return null
}

/** Находка словами, с именем карточки или этапа: голое «unknownInput» не сказало бы ничего. */
export const problemWords = (t: TFunction, draft: Scenario, problem: ScenarioProblem): string => {
  const card = draft.stages.flatMap((stage) => stage.cards).find((one) => one.id === problem.cardId)
  const stage = draft.stages.find((one) => one.id === problem.stageId)
  const name = problem.name ?? ''
  const values = {
    card: card?.title.trim() || t('scenarios.editor.untitledCard'),
    stage: stage?.title.trim() || t('scenarios.editor.untitledStage'),
    name,
    input: inputMention(name),
    slot: slotMention(name),
  }

  return t(`scenarios.editor.problems.${unnamedKey(problem) ?? problem.kind}`, values)
}

/** RUNS: от «1 time» до потолка и последним - «once per item of a list». */
export const runOptions = (t: TFunction): PickerOption[] => [
  ...RUN_COUNTS.map((count) => ({
    id: String(count),
    label: t('scenarios.editor.stage.times', { count }),
  })),
  { id: PER_ITEM, label: t('scenarios.editor.stage.perItem') },
]

const retryLabel = (t: TFunction, count: number): string => {
  if (count === 0) return t('scenarios.editor.head.never')
  if (count === 1) return t('scenarios.editor.head.once')
  if (count === 2) return t('scenarios.editor.head.twice')

  return t('scenarios.editor.head.times', { count })
}

/** SEND BACK: Never, Once, Twice, 3 times… до потолка возвратов. */
export const retryOptions = (t: TFunction): PickerOption[] =>
  RETRY_COUNTS.map((count) => ({ id: String(count), label: retryLabel(t, count) }))

/** Пункт «пусто» у модели, усилия и режима: как новый чат или как голова. */
export const fallbackOption = (t: TFunction, fallback: RunsOnFallback): PickerOption =>
  fallback === 'head'
    ? {
        id: '',
        label: t('scenarios.editor.card.sameAsHead'),
        description: t('scenarios.editor.card.sameAsHeadHint'),
      }
    : {
        id: '',
        label: t('scenarios.editor.head.asNewTab'),
        description: t('scenarios.editor.head.asNewTabHint'),
      }

/** EFFORT: «пусто» и уровни CLI. */
export const effortOptions = (t: TFunction, fallback: PickerOption): PickerOption[] => [
  fallback,
  ...EFFORT_LEVELS.map((level) => ({
    id: level,
    label: t(`scenarios.editor.runsOn.efforts.${level}`),
    description: t(`scenarios.editor.runsOn.effortHints.${level}`),
  })),
]

const isMode = (value: string): value is PermissionMode =>
  PERMISSION_MODES.some((mode) => mode === value)

/**
 * Режим, каким его показывает селектор: старое `manual` - это default, а пустой режим у головы
 * (файл без поля) движок и так читает как default.
 */
export const shownMode = (value: string, fallback: RunsOnFallback): string => {
  if (value === LEGACY_DEFAULT_MODE) return 'default'

  return value === '' && fallback === 'newTab' ? 'default' : value
}

/**
 * MODE: четыре режима сценария, у карточки первым - «как голова». Режим из файла, которого
 * меню не предлагает (auto), остаётся своим пунктом: открыть форму не должно молча менять,
 * с каким доверием идут карточки.
 */
export const modeOptions = (
  t: TFunction,
  fallback: PickerOption | null,
  value: string,
): PickerOption[] => {
  const modes =
    isMode(value) && !SCENARIO_MODES.includes(value) ? [...SCENARIO_MODES, value] : SCENARIO_MODES
  const options = modes.map((mode) => ({
    id: mode,
    label: t(`scenarios.editor.runsOn.modes.${mode}`),
    description: t(`scenarios.editor.runsOn.modeHints.${mode}`),
    icon: MODE_ICONS[mode],
  }))

  return fallback ? [fallback, ...options] : options
}

/** Цвет подписи MODE: насколько свободно действует модель. */
export const modeTone = (value: string): ModeTone | undefined =>
  isMode(value) ? MODE_TONES[value] : undefined

const modelOption = (model: ModelInfo): PickerOption => ({
  id: model.value,
  label: model.displayName,
  description: model.description || undefined,
})

/**
 * MODEL: каталог CLI (пока его нет - семьи, которые CLI знает всегда), без «по умолчанию» -
 * в меню это пункт «как новый чат»; основные сразу, старые версии - группой, свои - следом.
 * Свободного поля нет: имя, которого через полгода не станет, - сценарий, который не стартует.
 */
export const modelMenu = ({ catalog, custom }: ModelCatalog): ModelMenu => {
  const known = (catalog.length > 0 ? catalog : FALLBACK_MODELS).filter(
    (model) => model.value !== DEFAULT_MODEL_VALUE,
  )
  const values = new Set(known.map((model) => model.value))

  return {
    main: known.slice(0, MAIN_MODELS).map(modelOption),
    older: known.slice(MAIN_MODELS).map(modelOption),
    custom: custom.filter((name) => !values.has(name)).map((name) => ({ id: name, label: name })),
  }
}
