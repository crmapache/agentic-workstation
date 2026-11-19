import type { ProviderId } from '@shared/providers'
import { isProviderId } from '@shared/providers'

import { ConversationHooksLink } from '../hooks/conversation-hooks'
import type { AgentPanel } from './agent-panel'

/**
 * Панели провайдеров IDE по id (ADR 0083): обработчики `agent:*` и события берут панель
 * отсюда. Провайдер, которого в IDE нет, - ошибка запроса, а не тихий пропуск.
 */
export class PanelRegistry {
  private readonly panels = new Map<ProviderId, AgentPanel>()
  /**
   * Хуки расширений IDE во всех панелях (ADR 0091): панели получают связку при подъёме, а
   * расширения встают в неё позже, когда поднимутся.
   */
  readonly hooks = new ConversationHooksLink()

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

  /** Панель провайдера, если она есть в IDE. */
  find(provider: ProviderId): AgentPanel | undefined {
    return this.panels.get(provider)
  }
}
