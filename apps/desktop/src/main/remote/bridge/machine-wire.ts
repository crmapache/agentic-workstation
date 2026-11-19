import type { AccountsState } from '@shared/accounts'
import type { Connector } from '@shared/connectors'

import type {
  AccountsWire,
  ConnectorsWire,
} from '@agentic-workstation/remote-protocol/machine-wire-types'

/**
 * Аккаунты провайдера и коннекторы IDE - телефону. Почта - целиком (ADR 0064): по маске свои
 * аккаунты на одном домене не различить. Секретов, адресов серверов и команд коннекторов здесь
 * нет вовсе.
 */

/** Аккаунты с лимитами числами: окна (проценты и срок), доплата, отказ лимита. */
export const accountsWire = (state: AccountsState): AccountsWire => ({
  accounts: state.accounts.map((account) => {
    const usage = state.usage[account.id]

    return {
      id: account.id,
      alias: account.alias,
      email: account.email,
      plan: account.plan,
      signedIn: account.signedIn,
      current: account.id === state.current,
      refusedUntil: state.refusedUntil?.[account.id] ?? null,
      usage: usage
        ? {
            windows: usage.windows.map(({ group, model, percent, resetsAt }) => ({
              group,
              model,
              percent,
              resetsAt,
            })),
            extra: usage.extra?.percent ?? null,
            fetchedAt: usage.fetchedAt,
          }
        : null,
    }
  }),
})

/** Коннекторы: что за сервис, чей вход, на связи ли и сколько инструментов включено. */
export const connectorsWire = (connectors: readonly Connector[]): ConnectorsWire => ({
  connectors: connectors.map((connector) => ({
    id: connector.id,
    kind: connector.kind,
    name: connector.name,
    label: connector.label,
    account: connector.account,
    status: connector.status,
    failure: connector.failure,
    enabled: connector.enabled,
    tools: connector.tools.length,
    toolsOn: connector.tools.filter((tool) => tool.enabled).length,
  })),
})
