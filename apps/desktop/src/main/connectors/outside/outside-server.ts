import type { LiveConnector } from '../connector-live'
import type { ConnectorRegistry } from '../connector-registry'
import type { ConnectorsPlaces } from '../connectors-service.types'
import type { LiveConnectors } from '../live-connectors'
import type { Launch } from '../gateway/launches'
import { OutsideAccess } from './outside-access'

/**
 * Сервер самой IDE для входа снаружи (ADR 0090) - тот же живой коннектор Agentic Workstation, что
 * у разговоров IDE: выключенные человеком инструменты и выключенный коннектор не видны и снаружи.
 */
export const workstationServer =
  (registry: ConnectorRegistry, live: (id: string) => LiveConnector | null) => (launch: Launch) => {
    const connector = registry.connectors.find((one) => one.kind === 'workstation')
    const own = connector && live(connector.id)

    return connector && own
      ? { name: connector.serverName, server: own.gatewayServer(launch) }
      : null
  }

/** Вход снаружи коннекторов IDE: файл, хранилище и порт - из мест сервиса коннекторов. */
export const outsideAccess = (
  places: ConnectorsPlaces,
  registry: ConnectorRegistry,
  live: Pick<LiveConnectors, 'get'>,
  changed: () => void,
): OutsideAccess =>
  new OutsideAccess({
    file: places.outsideFile,
    vault: places.vault,
    port: places.outsidePort,
    version: places.version,
    server: workstationServer(registry, (id) => live.get(id)),
    changed,
  })
