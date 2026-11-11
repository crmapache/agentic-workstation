import type { AccountsState } from '@shared/claude-accounts'
import type { Connector } from '@shared/connectors'

import type {
  AccountsWire,
  ConnectorsWire,
} from '@agentic-workstation/remote-protocol/machine-wire-types'

/**
 * Аккаунты провайдера и коннекторы IDE - телефону. Почта уходит замаскированной: свои аккаунты
 * отличить хватает начала и конца имени и домена, а адрес целиком с машины не уходит - экран
 * телефона видят чужие глаза, а страницу телефону отдаёт релей (ADR 0041, «Доверие к релею»).
 * Секретов, адресов серверов и команд коннекторов здесь нет вовсе.
 */

/** Сколько знаков начала имени видно; конец - один знак. Короче - только первый знак. */
const SHOWN_HEAD = 2

/** `mzpizote@gmail.com` → `mz…e@gmail.com`; не почта - как есть. */
export const maskEmail = (email: string): string => {
  const at = email.lastIndexOf('@')

  if (at <= 0) return email

  const name = email.slice(0, at)
  const domain = email.slice(at)

  if (name.length <= SHOWN_HEAD + 1) return `${name.slice(0, 1)}…${domain}`

  return `${name.slice(0, SHOWN_HEAD)}…${name.slice(-1)}${domain}`
}

/** Аккаунты с лимитами числами: окна (проценты и срок), доплата, отказ лимита. */
export const accountsWire = (state: AccountsState): AccountsWire => ({
  accounts: state.accounts.map((account) => {
    const usage = state.usage[account.id]

    return {
      id: account.id,
      alias: account.alias,
      email: maskEmail(account.email),
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
    account: connector.account === null ? null : maskEmail(connector.account),
    status: connector.status,
    failure: connector.failure,
    enabled: connector.enabled,
    tools: connector.tools.length,
    toolsOn: connector.tools.filter((tool) => tool.enabled).length,
  })),
})
