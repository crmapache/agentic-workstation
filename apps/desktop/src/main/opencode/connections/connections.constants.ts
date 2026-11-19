import type { ModelConnectionKind } from '@shared/open-models'

/** Сколько ждать ответа подключения на пробе: локальный сервер отвечает сразу, облако - быстро. */
export const PROBE_TIMEOUT_MS = 8_000

/**
 * Сколько ждать, пока Ollama загрузит модель, чтобы назвать её окно: большая модель с диска
 * грузится секунды, на медленном диске - дольше. Не дождались - процесс OpenCode идёт с тем
 * окном, что знали, а загрузку сервер доведёт сам.
 */
export const LOAD_TIMEOUT_MS = 120_000

/**
 * Адреса подключений по умолчанию. Ollama и LM Studio - их обычные порты на этом компьютере;
 * OpenRouter - его API в формате OpenAI.
 */
export const DEFAULT_BASE_URLS: Record<Exclude<ModelConnectionKind, 'custom'>, string> = {
  ollama: 'http://127.0.0.1:11434',
  lmstudio: 'http://127.0.0.1:1234',
  openrouter: 'https://openrouter.ai/api/v1',
}

/** Имена найденных локальных серверов и OpenRouter - имена продуктов, не текст интерфейса. */
export const KIND_LABELS: Record<ModelConnectionKind, string> = {
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  openrouter: 'OpenRouter',
  custom: '',
}

/** Окно контекста, когда подключение его не назвало: столько OpenCode отдаёт модели. */
export const FALLBACK_CONTEXT = 32_768

/** Ответ модели не длиннее этого: OpenCode обрезает окно под ответ сам. */
export const FALLBACK_OUTPUT = 8_192
