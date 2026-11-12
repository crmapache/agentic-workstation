import type { TFunction } from 'i18next'

import type { ConnectorWire } from '@agentic-workstation/remote-protocol/machine-wire-types'

/** Имя коннектора: своё у своего типа, у встроенного (Gmail, Notion) - по его виду. */
export const connectorName = (t: TFunction, connector: ConnectorWire): string =>
  connector.name ?? t(`connectors.kinds.${connector.kind}`, { defaultValue: connector.kind })

/** Под именем: подпись подключения и чей вход, без пустых. */
export const connectorFacts = (connector: ConnectorWire): string =>
  [connector.label, connector.account].filter(Boolean).join(' · ')
