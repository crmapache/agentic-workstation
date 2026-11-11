import type { TFunction } from 'i18next'

import { EFFORTS } from '@agentic-workstation/remote-protocol/commands'
import type { ProviderCaps } from '@agentic-workstation/remote-protocol/wire-types'

import type { OptionItem } from '../shell/OptionList/OptionList.types'

/** Модели провайдера и «как в настройках» (пустое значение - модель не выбрана). */
export const modelOptions = (t: TFunction, provider: ProviderCaps): OptionItem<string>[] => [
  { value: '', label: t('options.defaultModel') },
  ...provider.models.map((model) => ({
    value: model.value,
    label: model.label,
    description: model.description,
  })),
]

/** Усилия провайдера, которые знает протокол, и «как в настройках». */
export const effortOptions = (t: TFunction, provider: ProviderCaps): OptionItem<string>[] => [
  { value: '', label: t('options.defaultEffort') },
  ...provider.efforts
    .filter((effort) => (EFFORTS as readonly string[]).includes(effort))
    .map((effort) => ({ value: effort, label: t(`effort.${effort}`, { defaultValue: effort }) })),
]

/** Режимы нового разговора с телефона: только те, что разрешил протокол и назвала IDE. */
export const modeOptions = (t: TFunction, provider: ProviderCaps): OptionItem<string>[] =>
  provider.permissionModes.map((mode) => ({
    value: mode,
    label: t(`modes.${mode}.label`, { defaultValue: mode }),
    description: t(`modes.${mode}.description`, { defaultValue: '' }),
  }))
