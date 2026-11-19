import type { TFunction } from 'i18next'

import type { Conversation, ConversationOptions } from '@shared/conversation'
import type { PanelPrefs, SetupPreset } from '@shared/panel-prefs'

import type { PickableModel } from './models.types'
import { modelLabel } from './models.utils'
import { SETUP_SEPARATOR } from './ComposerStatus/ComposerStatus.constants'

/** Что пресет сравнивает и меняет у разговора. */
type Setup = Pick<Conversation, 'model' | 'effort' | 'permissionMode'>

/** Пресеты, которые стоят кнопками под полем: первые presetCount (ADR 0096). */
export const shownPresets = (prefs: PanelPrefs): readonly SetupPreset[] =>
  prefs.presets.slice(0, prefs.presetCount)

/**
 * Какая кнопка горит: пресет, чьи модель и усилие стоят у разговора (ADR 0096). Режим в счёт
 * не идёт - его меняют Shift+Tab, принятый план и сам CLI, и кнопка гасла бы на каждом шаге.
 * Совпали двое - горит тот, у кого совпал и режим, иначе первый; -1 - ни один.
 */
export const activePreset = (presets: readonly SetupPreset[], setup: Setup): number => {
  const matching = presets.flatMap((preset, index) =>
    preset.model === setup.model && preset.effort === setup.effort ? [index] : [],
  )

  return (
    matching.find((index) => presets[index]?.mode === setup.permissionMode) ?? matching[0] ?? -1
  )
}

/**
 * Что пресет меняет у разговора - только то, что отличается: лишний запрос модели CLI сбросил
 * бы слежку за ней. Режим, который сейчас недоступен (запрещён настройками, CLI уже отказал), -
 * не просится: модель и усилие встают, режим остаётся, как был. null - менять нечего.
 */
export const presetOptions = (
  preset: SetupPreset,
  setup: Setup,
  modeOff: boolean,
): ConversationOptions | null => {
  const options: ConversationOptions = {
    ...(preset.model !== setup.model && { model: preset.model }),
    ...(preset.effort !== setup.effort && { effort: preset.effort }),
    ...(preset.mode !== setup.permissionMode && !modeOff && { permissionMode: preset.mode }),
  }

  return Object.keys(options).length > 0 ? options : null
}

/**
 * Пресеты под новое число кнопок: недостающие - с того, что стоит у вкладки сейчас (настроил
 * вкладку - сделал из неё кнопку), имя - номером. Лишние не выбрасываются: убрал кнопку и вернул -
 * пресет тот же.
 */
export const presetsFor = (
  presets: readonly SetupPreset[],
  count: number,
  setup: Setup | null,
  nameOf: (number: number) => string,
): SetupPreset[] => [
  ...presets,
  ...Array.from({ length: Math.max(0, count - presets.length) }, (_, index) => ({
    name: nameOf(presets.length + index + 1),
    model: setup?.model ?? null,
    effort: setup?.effort ?? null,
    mode: setup?.permissionMode ?? 'default',
  })),
]

/** Пресеты с заменой одного по номеру: экран пресета правит его поле за полем. */
export const withPreset = (
  presets: readonly SetupPreset[],
  index: number,
  patch: Partial<SetupPreset>,
): SetupPreset[] => presets.map((preset, at) => (at === index ? { ...preset, ...patch } : preset))

/**
 * Что пресет ставит словами: «Opus 5.5 · High effort · Bypass permissions» - в подсказке
 * кнопки; short - «Opus 5.5 · High · Bypass», как на индикаторе, - справа от строки Settings.
 * «По умолчанию» называется с тем, что по умолчанию: два «Default» подряд не различить.
 */
export const presetSummary = (
  preset: SetupPreset,
  models: readonly PickableModel[],
  t: TFunction,
  short = false,
): string => {
  const model = preset.model
    ? modelLabel(preset.model, models)
    : t('agentPanel.status.defaultModel')
  const level = preset.effort && t(`agentPanel.effort.levels.${preset.effort}`)
  const effortInFull = level ? t('agentPanel.status.effortValue', { value: level }) : ''
  const effort = (short ? level : effortInFull) || t('agentPanel.effort.default')
  const mode = short
    ? t(`agentPanel.modes.short.${preset.mode}`)
    : t(`agentPanel.modes.labels.${preset.mode}`)

  return [model, effort, mode].join(SETUP_SEPARATOR)
}
