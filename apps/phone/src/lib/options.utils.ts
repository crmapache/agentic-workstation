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

/**
 * Режимы разрешений провайдера - словами меню MODE окна IDE (ADR 0076). Что IDE гасит
 * (unavailable: bypass под запретом настроек, auto после отказа CLI), видно погашенным; текущий
 * режим разговора (current) не гасится и у окна. Старая IDE погашенного не шлёт - тогда
 * доступно всё, последнее слово за её отказом.
 */
export const modeOptions = (
  t: TFunction,
  provider: ProviderCaps,
  unavailable: readonly string[] = [],
  current?: string,
): OptionItem<string>[] =>
  provider.permissionModes.map((mode) => ({
    value: mode,
    label: t(`modes.${mode}.label`, { defaultValue: mode }),
    description: t(`modes.${mode}.description`, { defaultValue: '' }),
    disabled: mode !== current && unavailable.includes(mode),
  }))

/**
 * Режим разговора коротко, как на индикаторе под полем окна (Ask, Plan, Auto, Bypass…), - для
 * строки под заголовком. Обычный «спрашивать» не называется: виден только режим, в котором
 * разговор оставили работать сам.
 */
export const modeShortLabel = (t: TFunction, mode: string): string | null =>
  mode === 'default' ? null : t(`modes.${mode}.short`, { defaultValue: mode })
