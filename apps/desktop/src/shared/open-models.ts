/**
 * Подключения панели открытых моделей (ADR 0084, docs/plan-providers/40-open-models.md): откуда
 * OpenCode берёт модели. Ollama и LM Studio IDE находит сама на их портах, OpenRouter и свой
 * адрес в формате OpenAI добавляет человек. Ключ подключения окну не уходит - только есть ли он.
 */

export type ModelConnectionKind = 'ollama' | 'lmstudio' | 'openrouter' | 'custom'

/**
 * Модель подключения для меню: умеет ли вызывать инструменты и рассуждать с уровнями усилия,
 * окно контекста; null - подключение не сказало. У Ollama окно - то, с которым сервер держит
 * модель, а не её предел (ADR 0087): пока сервер его не назвал, null.
 */
export type ConnectionModel = {
  id: string
  name: string
  tools: boolean | null
  reasoning: boolean | null
  context: number | null
}

/** Уровни рассуждения открытых моделей - вариантами OpenCode (`reasoningEffort`). */
export const REASONING_LEVELS = ['low', 'medium', 'high'] as const

/**
 * Как подключение ответило на пробу: работает, не запущено (локальный сервер), ключ не принят,
 * сбой с причиной; checking - проба идёт.
 */
export type ConnectionState = 'checking' | 'ok' | 'offline' | 'unauthorized' | 'failed'

/** Расход ключа облачного подключения (OpenRouter `/key`), в долларах; limit null - без лимита. */
export type ConnectionCredits = { used: number; limit: number | null }

export type ModelConnection = {
  id: string
  kind: ModelConnectionKind
  label: string
  /** Адрес сервера; у своего - тот, что дал человек. */
  baseUrl: string
  hasKey: boolean
  /** Локальный сервер на своём порту, найденный сам: убрать нельзя, только не пользоваться. */
  detected: boolean
  state: ConnectionState
  /** Слова сбоя сервера для экрана; пусто - сбоя нет. */
  error: string
  models: ConnectionModel[]
  /** Расход ключа; нет - подключение его не называет (локальные, свой адрес). */
  credits: ConnectionCredits | null
}

/** Меньше этого окна контекста агенту тесно: меню предупреждает у модели. */
export const SMALL_CONTEXT_TOKENS = 32_000
