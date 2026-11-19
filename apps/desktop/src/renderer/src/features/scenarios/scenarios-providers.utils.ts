import type { ProviderInfo, ProviderModel } from '@shared/providers'

/**
 * Модели провайдера сценария для редактора: модель карточки - строка именно этого провайдера.
 * Какой провайдер действует - effectiveProvider (state/providers.queries.ts).
 */

/** Модели провайдера; провайдера нет или он их не назвал - пусто. */
export const providerModels = (provider: ProviderInfo | null): readonly ProviderModel[] =>
  provider?.models ?? []
