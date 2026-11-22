import type { CommandArgs } from '@agentic-workstation/remote-protocol/commands'
import type { ProviderCaps, ProviderPreset } from '@agentic-workstation/remote-protocol/wire-types'

import { effortsOf } from '../../../lib/options.utils'
import type { NewChoice } from './NewConversationScreen.types'

type NewArgs = CommandArgs<'conversation.new'>

/**
 * Какая плашка пресета горит - как кнопка под полем окна (ADR 0096): чьи модель и усилие выбраны.
 * Режим в счёт не идёт и только выбирает из двух равных: совпал и он - тот, иначе первый; -1 - ни
 * один. «Как в IDE» не совпадает ни с одним: что за ним стоит, знает только IDE.
 */
export const activePreset = (presets: readonly ProviderPreset[], choice: NewChoice): number => {
  const matching = presets.flatMap((preset, index) =>
    preset.model === choice.model && preset.effort === choice.effort ? [index] : [],
  )

  return matching.find((index) => presets[index]?.mode === choice.mode) ?? matching[0] ?? -1
}

/**
 * Выбор после нажатия пресета: его модель, усилие и режим. Режим, в котором новый разговор
 * проекта не начнётся (не этого провайдера, bypass под запретом, auto после отказа CLI), не
 * ставится - остаётся прежний, как у кнопки окна: иначе IDE отказала бы весь разговор.
 */
export const presetChoice = (
  preset: ProviderPreset,
  choice: NewChoice,
  provider: ProviderCaps,
  unavailable: readonly string[] = [],
): NewChoice => {
  const modeOn =
    provider.permissionModes.includes(preset.mode) && !unavailable.includes(preset.mode)

  return { model: preset.model, effort: preset.effort, mode: modeOn ? preset.mode : choice.mode }
}

/** Выбор с другой моделью: уровень усилия, которого у неё нет, снимается к «как в IDE». */
export const withModel = (provider: ProviderCaps, choice: NewChoice, model: string): NewChoice => ({
  ...choice,
  model,
  effort: choice.effort && !effortsOf(provider, model).includes(choice.effort) ? '' : choice.effort,
})

/** Команда нового разговора: «как в IDE» не шлётся, «по умолчанию» пресета уходит null. */
export const newConversationArgs = (
  projectKey: string,
  provider: string,
  choice: NewChoice,
): NewArgs => ({
  projectKey,
  provider,
  ...(choice.model !== '' && { model: choice.model }),
  ...(choice.effort !== '' && {
    effort: choice.effort as NonNullable<NewArgs['effort']> | null,
  }),
  ...(choice.mode && { permissionMode: choice.mode as NonNullable<NewArgs['permissionMode']> }),
})
