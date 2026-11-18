import type { ProviderId } from '@shared/providers'
import { isProviderId } from '@shared/providers'

import type { AgentPanel } from './agent-panel'

/**
 * Панели провайдеров IDE по id (ADR 0083): обработчики `agent:*` и события берут панель
 * отсюда. Провайдер, которого в IDE нет, - ошибка запроса, а не тихий пропуск.
 */
export class PanelRegistry {
  private readonly panels = new Map<ProviderId, AgentPanel>()

  add(provider: ProviderId, panel: AgentPanel): void {
    this.panels.set(provider, panel)
  }

  /** Панель провайдера из запроса окна. */
  get(provider: unknown): AgentPanel {
    if (!isProviderId(provider)) throw new Error('Неизвестный провайдер')

    const panel = this.panels.get(provider)

    if (!panel) throw new Error(`Провайдера ${provider} в IDE нет`)

    return panel
  }

  has(provider: ProviderId): boolean {
    return this.panels.has(provider)
  }
}
