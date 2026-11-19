import type { EffortLevel, PermissionMode } from './conversation'

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
  /** Уровни усилия модели; нет поля - уровни провайдера, пусто - модель без усилия. */
  efforts?: readonly EffortLevel[] | undefined
  /** Уровень модели по умолчанию (Codex). */
  defaultEffort?: EffortLevel | undefined
  /** Модель провайдера по умолчанию: пустое поле модели идёт на неё. */
  isDefault?: boolean | undefined
  /** Группа меню: подключение открытых моделей. */
  group?: { id: string; label: string } | undefined
}

/**
 * Что окно знает о провайдере: имя, на месте ли он, на каких моделях работает, какие у него
 * режимы разрешений и уровни усилия. Один список на сценарии, задания, коннектор от ИИ,
 * служебные задачи и телефон (docs/plan-providers/50-ide.md).
 */
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
  /** Режимы разрешений провайдера по порядку (как меню MODE его панели). */
  modes: readonly PermissionMode[]
  /** Уровни усилия провайдера - у модели без своего списка. */
  efforts: readonly EffortLevel[]
}

/** Модель, на которой пойдёт пустое поле модели: «по умолчанию» провайдера, иначе первая. */
export const defaultModelOf = (provider: Pick<ProviderInfo, 'models'> | null): string =>
  provider?.models?.find((one) => one.isDefault)?.value ?? provider?.models?.[0]?.value ?? ''

/**
 * Уровни усилия модели у провайдера: свои у модели, иначе провайдера. Пустая модель - модель,
 * на которой работа реально пойдёт (по умолчанию): у модели без размышлений уровней нет.
 */
export const providerEfforts = (
  provider: Pick<ProviderInfo, 'efforts' | 'models'> | null,
  model: string,
): readonly EffortLevel[] => {
  if (!provider) return []

  const value = model || defaultModelOf(provider)
  const known = provider.models?.find((one) => one.value === value)

  return known?.efforts ?? provider.efforts
}
