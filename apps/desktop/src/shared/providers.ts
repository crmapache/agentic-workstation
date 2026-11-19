import type { EffortLevel, PermissionMode } from './conversation'

/**
 * Провайдеры ИИ на уровне IDE (ADR 0083, 0092): Claude Code, Codex, Google Antigravity, Kimi
 * Code и открытые модели (OpenCode), у каждого своя панель. Всё, что не панель провайдера
 * (сценарии, статистика, удалённый доступ), говорит о провайдере этим словом, а не «Claude».
 * Порядок списка - порядок иконок панелей. Какие из них сейчас в IDE - знает реестр панелей
 * главного процесса (providers:list). Таблицы по провайдеру - `Record<ProviderId, ...>`, а не
 * развилки: новый провайдер не скомпилируется, пока его нет в каждой (ADR 0093).
 */
export const PROVIDER_IDS = ['claude', 'codex', 'antigravity', 'kimi', 'opencode'] as const

export type ProviderId = (typeof PROVIDER_IDS)[number]

export const isProviderId = (value: unknown): value is ProviderId =>
  typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value)

/**
 * Может ли провайдер работать без человека (ADR 0094): сценарии, задания, цели, служебная
 * работа, коннектор от ИИ, сообщения от других агентов. Antigravity на личном входе Google - нет:
 * условия Google это запрещают; он работает только в своём чате.
 */
const UNATTENDED: Record<ProviderId, boolean> = {
  claude: true,
  codex: true,
  antigravity: false,
  kimi: true,
  opencode: true,
}

export const worksUnattended = (provider: ProviderId): boolean => UNATTENDED[provider]

/** Провайдеры, которым можно работать без человека, по порядку. */
export const UNATTENDED_PROVIDER_IDS: readonly ProviderId[] = PROVIDER_IDS.filter(worksUnattended)

/** Провайдер, который может работать без человека. */
export const isUnattendedProviderId = (value: unknown): value is ProviderId =>
  isProviderId(value) && worksUnattended(value)

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
  /** Работает только в своём чате (ADR 0094): в выборе фоновой работы погашен. */
  chatOnly?: boolean | undefined
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
