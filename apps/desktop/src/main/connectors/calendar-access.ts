import type { ConnectorKind } from '@shared/connectors'
import { SECOND_MS } from '@shared/time-units'

import type { LiveConnector } from './connector-live'
import type { ConnectorRegistry } from './connector-registry'
import type { StoredConnector } from './connector-store'
import type { GatewayHost } from './gateway-host'
import type { GoogleClient } from './oauth/google-oauth'
import { GoogleSession } from './kinds/google/google-session'

/** Один запрос к Google: дольше - сеть легла, синк не должен висеть. */
const GOOGLE_TIMEOUT_MS = 20 * SECOND_MS

/** Почему коннектор источника не годится: нет его, выключен или нет входа. */
export type CalendarConnectorFailure = 'connector-missing' | 'connector-off' | 'signed-out'

/**
 * Что календарю (ADR 0114) нужно от коннекторов: вход Google аккаунта для прямого чтения без
 * модели и запуск шлюза с допуском для чтения ИИ. Календарь общий на IDE, поэтому коннектор
 * берётся по id из источника, а не по доступности в проекте.
 */
export class CalendarConnectors {
  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly live: (id: string) => LiveConnector | null,
    readonly gateway: GatewayHost,
    private readonly googleClient: () => GoogleClient | null,
  ) {}

  /** Коннектор нужного вида, включённый; иначе причина. */
  connector(
    id: string,
    kinds: readonly ConnectorKind[],
  ): StoredConnector | CalendarConnectorFailure {
    const connector = this.registry.find(id)

    if (!connector || !kinds.includes(connector.kind)) return 'connector-missing'

    return connector.enabled ? connector : 'connector-off'
  }

  /**
   * Сессия Google коннектора Calendar на один синк: запросы гаснут с отменой синка и по сроку.
   * Токены общие с живым коннектором: обновлённый вход пишется туда же.
   */
  google(connectorId: string, signal: AbortSignal): GoogleSession | CalendarConnectorFailure {
    const connector = this.connector(connectorId, ['calendar'])

    if (typeof connector === 'string') return connector

    const live = this.live(connector.id)

    if (!live?.secrets.read().google) return 'signed-out'

    const timed: typeof fetch = (input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.any([signal, AbortSignal.timeout(GOOGLE_TIMEOUT_MS)]),
      })

    return new GoogleSession(live.secrets, this.googleClient, timed)
  }
}
