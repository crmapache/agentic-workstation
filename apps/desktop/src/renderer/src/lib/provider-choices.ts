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
 * Варианты провайдера для выбора в окне: подпись и пометка «не установлен». Где выбор сразу
 * запускает работу (задание, коннектор, Settings → AI, запуск и час сценария), не установленный
 * погашен; у головы сценария его выбрать можно - сценарий пишут и под чужую машину.
 */
export const providerChoices = (
  providers: readonly ProviderInfo[],
  t: TFunction,
  allowMissing = false,
): ProviderChoice[] =>
  providers.map((one) => ({
    value: one.id,
    label: one.label,
    description: one.available ? undefined : t('common.notInstalled'),
    disabled: !one.available && !allowMissing,
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
