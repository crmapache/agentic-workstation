import type { TFunction } from 'i18next'

import { EFFORTS } from '@agentic-workstation/remote-protocol/commands'
import type { ProviderCaps } from '@agentic-workstation/remote-protocol/wire-types'
import { takesUnattendedWork } from '@agentic-workstation/remote-protocol/wire-types'

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

/**
 * Уровни усилия модели: свои у модели (Codex, открытые модели), иначе провайдера - как меню
 * окна IDE. Модель не выбрана или каталог о ней молчит - уровни провайдера.
 */
export const effortsOf = (provider: ProviderCaps, model?: string | null): readonly string[] =>
  provider.models.find((one) => one.value === model)?.efforts ?? provider.efforts

/** Усилия модели провайдера, которые знает протокол, и «как в настройках». */
export const effortOptions = (
  t: TFunction,
  provider: ProviderCaps,
  model?: string | null,
): OptionItem<string>[] => [
  { value: '', label: t('options.defaultEffort') },
  ...effortsOf(provider, model)
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

/**
 * Провайдеры для работы без человека, которую ставит телефон (прогон сценария, час расписания):
 * те, что стоят на машине. Кто работает только в своём чате (Antigravity, ADR 0094), виден
 * погашенным с причиной, а не пропадает: в разговорах он есть, и человек видит, почему его здесь
 * не выбрать, а не узнаёт отказом IDE.
 */
export const unattendedProviderOptions = (
  t: TFunction,
  providers: readonly ProviderCaps[],
): OptionItem<string>[] =>
  providers
    .filter((one) => one.available)
    .map((one) => ({
      value: one.id,
      label: one.label,
      ...(!takesUnattendedWork(one) && { description: t('options.chatOnly'), disabled: true }),
    }))

/** Провайдер прогона, пока человек не выбрал: первый, кто возьмёт работу без человека; никто - пусто. */
export const defaultUnattendedProvider = (providers: readonly ProviderCaps[]): string =>
  providers.find(takesUnattendedWork)?.id ?? ''
