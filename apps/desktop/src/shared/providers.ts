/**
 * Провайдеры ИИ на уровне IDE. Сейчас один - Claude Code, но всё, что не панель провайдера
 * (сценарии, статистика, удалённый доступ), говорит о провайдере этим словом, а не «Claude»:
 * второй провайдер встаёт рядом, не переделывая их.
 */
export type ProviderId = 'claude'

export const PROVIDER_IDS: readonly ProviderId[] = ['claude']

export const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value)

/** Почему провайдер сейчас не работает - кодом, текст у окна. */
export type ProviderUnavailable = 'noCli'

/** Что окно знает о провайдере: имя, на месте ли он. */
export type ProviderInfo = {
  id: ProviderId
  label: string
  available: boolean
  unavailable: ProviderUnavailable | null
}
