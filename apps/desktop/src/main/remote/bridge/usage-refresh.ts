import type { ProviderId } from '@shared/providers'
import { MINUTE_MS } from '@shared/time-units'

import type { PanelsPort } from './bridge-ports'
import { panelOf } from './panels'

/** Как часто телефон, открытый на разговоре, освежает лимиты его провайдера: как панель окна. */
export const PHONE_USAGE_REFRESH_MS = 2 * MINUTE_MS

/**
 * Лимиты провайдеров, чьи разговоры смотрит телефон: окно освежает только лимиты своей открытой
 * панели, а телефон может смотреть разговор Codex, пока в окне Claude Code. Освежённое меняет
 * состояние панели, и цифры уходят телефону с состоянием разговора.
 */
export class UsageRefresh {
  private readonly askedAt = new Map<ProviderId, number>()

  constructor(private readonly panels: PanelsPort) {}

  /** Освежить, если шаг прошёл; soon - сразу (телефон только что открыл разговор). */
  ask(providers: Iterable<ProviderId>, now: number, soon = false): void {
    for (const provider of new Set(providers)) {
      const last = this.askedAt.get(provider)

      if (!soon && last !== undefined && now - last < PHONE_USAGE_REFRESH_MS) continue

      this.askedAt.set(provider, now)
      panelOf(this.panels, provider)
        ?.refreshUsage()
        .catch((error: unknown) => {
          console.warn(`[remote] лимиты ${provider} не освежились:`, error)
        })
    }
  }
}
