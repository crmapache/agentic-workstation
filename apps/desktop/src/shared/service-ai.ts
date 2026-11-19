import { MODEL_NAME_PATTERN } from './panel-prefs'
import type { ProviderId } from './providers'
import { isProviderId } from './providers'

/**
 * Кто делает служебную работу IDE (Settings → AI, docs/plan-providers/50-ide.md): имена
 * очередей, проверки поручений, черновики заданий и сценариев. Провайдер и модель; пустая
 * модель - своя у каждой работы (у Claude Code - Haiku на проверках, Sonnet и выше на
 * черновиках, у других - модель провайдера по умолчанию).
 */
export type ServiceAi = { provider: ProviderId; model: string }

/** Как было до настройки: Claude Code и его модели у каждой работы. */
export const DEFAULT_SERVICE_AI: ServiceAi = { provider: 'claude', model: '' }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Настройка с диска или из окна; негодное поле - умолчание, а не ошибка. */
export const parseServiceAi = (value: unknown): ServiceAi => {
  const raw = isRecord(value) ? value : {}
  const model = typeof raw['model'] === 'string' ? raw['model'].trim() : ''

  return {
    provider: isProviderId(raw['provider']) ? raw['provider'] : DEFAULT_SERVICE_AI.provider,
    model: model && MODEL_NAME_PATTERN.test(model) ? model : '',
  }
}
