/**
 * Провайдеры ИИ на уровне IDE (ADR 0083): Claude Code, Codex и открытые модели (OpenCode),
 * у каждого своя панель. Всё, что не панель провайдера (сценарии, статистика, удалённый
 * доступ), говорит о провайдере этим словом, а не «Claude». Какие из них сейчас в IDE -
 * знает реестр панелей главного процесса (providers:list), а не этот список.
 */
export type ProviderId = 'claude' | 'codex' | 'opencode'

export const PROVIDER_IDS: readonly ProviderId[] = ['claude', 'codex', 'opencode']

export const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value)

/** Почему провайдер сейчас не работает - кодом, текст у окна. */
export type ProviderUnavailable = 'noCli'

/**
 * Модель, на которой провайдер может работать: чем её запускать (value), имя и пояснение для
 * меню. custom - добавлена человеком (у Claude Code - Settings → Custom models): каталог
 * провайдера о ней не знает, и меню ставит её отдельно.
 */
export type ProviderModel = {
  value: string
  displayName: string
  description: string
  custom: boolean
}

/** Что окно знает о провайдере: имя, на месте ли он, на каких моделях работает. */
export type ProviderInfo = {
  id: ProviderId
  label: string
  available: boolean
  unavailable: ProviderUnavailable | null
  /**
   * Модели по порядку провайдера: сначала его каталог, за ним свои. Заполняет главный процесс
   * всегда (providers:list, providers:changed). Необязательное поле - только ради тех, кто
   * собирает ProviderInfo сам (подделка IDE в тестах моста Remote Control): нет поля - нет и
   * моделей.
   */
  models?: readonly ProviderModel[] | undefined
}
