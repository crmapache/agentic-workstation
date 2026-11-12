import type { ProviderInfo, ProviderModel } from '@shared/providers'

/**
 * Провайдер сценария там, где его ещё не выбирали: окно запуска ставит его первым, редактор
 * берёт его модели - в файле сценария провайдера нет, и модель карточки - строка именно его.
 */

/** Провайдер по умолчанию: первый, что на месте, иначе первый - пусть скажет, почему его нет. */
export const defaultProvider = (providers: readonly ProviderInfo[]): ProviderInfo | null =>
  providers.find((one) => one.available) ?? providers[0] ?? null

/** Модели провайдера; провайдера нет или он их не назвал - пусто. */
export const providerModels = (provider: ProviderInfo | null): readonly ProviderModel[] =>
  provider?.models ?? []
