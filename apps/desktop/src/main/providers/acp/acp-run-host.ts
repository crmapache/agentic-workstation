import type { AcpCli, AcpAgent } from '../../acp/acp-agent'
import { isAuthError } from '../../acp/client/acp-process'
import type { AcpConnectors } from '../../acp/conversation/acp-conversation'

/** Что переводчику ACP нужно от панели агента (AcpPanel.runHost). */
export type AcpRunHost = {
  agent: AcpAgent
  /** Имя провайдера в словах сбоя: движок показывает их человеку как есть. */
  label: string
  cli: () => Promise<AcpCli | null>
  /**
   * Коннекторы IDE процессу (ADR 0029): серверы шлюза по HTTP с ключом процесса. ideServers -
   * свои серверы IDE только этому процессу; only - только эти серверы, нет - все серверы проекта.
   */
  connectors: (
    projectPath: string,
    ideServers: readonly string[],
    only?: readonly string[],
  ) => AcpConnectors
  /** Агент отказал без входа: панель покажет вход, как после отказа во вкладке. */
  signedOut: () => void
  version: string
  /** Папка журналов сессий прогонов провайдера (run-journal.ts). */
  journalDir: string
}

/**
 * Причина сбоя для движка и журнала: отказ без входа - одной строкой, что делать (движок
 * показывает человеку последнюю строку причины), остальное - как сказал агент.
 */
export const failureOf = (host: Pick<AcpRunHost, 'label'>, error: unknown): string =>
  isAuthError(error)
    ? `${host.label} is not signed in. Sign in on the ${host.label} panel and run again.`
    : (error instanceof Error ? error.message : String(error)).trim()
