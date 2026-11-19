import type { TFunction } from 'i18next'

import type { ProviderInfo } from '@shared/providers'

/** Вариант выбора - той же формы, что у ChoiceField дизайн-системы (окно отдаёт его туда). */
export type ProviderChoice = {
  value: string
  label: string
  description?: string | undefined
  disabled?: boolean | undefined
}

/**
 * Возьмёт ли провайдер работу, которую начинает IDE (ADR 0094): стоит на машине и не только для
 * своего чата. Одно правило на выбор по умолчанию, кнопку запуска и погашенный пункт меню.
 */
export const takesIdeWork = (provider: Pick<ProviderInfo, 'available' | 'chatOnly'>): boolean =>
  provider.available && provider.chatOnly !== true

/**
 * Почему провайдер не возьмёт такую работу - коротко, для пункта меню и строки под выбором;
 * возьмёт - undefined. «Только в своём чате» главнее «не установлен»: установка его не вернёт.
 */
export const providerRefusal = (
  provider: Pick<ProviderInfo, 'available' | 'chatOnly'>,
  t: TFunction,
): string | undefined => {
  if (provider.chatOnly) return t('common.chatOnly')

  return provider.available ? undefined : t('common.notInstalled')
}

/**
 * Варианты провайдера для работы, которую начинает IDE (сценарии, часы, задания, коннектор от
 * ИИ, Settings → AI, расширение с ИИ): подпись и пометка «не установлен» или «только в своём
 * чате». Провайдер только для чата (Antigravity, ADR 0094) погашен везде; не установленный - там,
 * где выбор сразу запускает работу, а у головы сценария его выбрать можно (allowMissing):
 * сценарий пишут и под чужую машину.
 */
export const providerChoices = (
  providers: readonly ProviderInfo[],
  t: TFunction,
  allowMissing = false,
): ProviderChoice[] =>
  providers.map((one) => ({
    value: one.id,
    label: one.label,
    description: providerRefusal(one, t),
    disabled: one.chatOnly === true || (!one.available && !allowMissing),
  }))

/** Варианты модели провайдера: первым - «по умолчанию» (пусто), у модели - пояснение или подключение. */
export const modelChoices = (
  provider: ProviderInfo | null,
  defaultLabel: string,
): ProviderChoice[] => [
  { value: '', label: defaultLabel },
  ...(provider?.models ?? []).map((model) => ({
    value: model.value,
    label: model.displayName,
    description: model.description || model.group?.label,
  })),
]
