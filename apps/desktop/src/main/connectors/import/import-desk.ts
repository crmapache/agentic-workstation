import { randomUUID } from 'node:crypto'

import type {
  McpAuth,
  McpTransport,
  ImportOutcome,
  ImportCandidate,
  ImportSkipReason,
  AddConnectorError,
} from '@shared/connectors'

import type { NewConnector } from '../connector-add'
import { groupByBase } from '../connector-types'
import { asPlaywright } from '../kinds/playwright'
import { hasHeaders, findServers } from './import-candidates'
import type { FoundServer } from './import-candidates'
import { withImportType, importedConnector } from './import-connector'
import { probeAuth } from './import-probe'
import { readImportSources } from './import-sources'
import { MissingVariable, expandConfigVariables } from './import-vars'

/** Что импорту нужно от сервиса и окружения. */
export type ImportHost = {
  serverNames: () => Set<string>
  /** Добавить готовый коннектор без входа в браузере: окна входа не открываются пачкой. */
  add: (prepared: NewConnector) => Promise<AddConnectorError | null>
  /** Открытые проекты: их свои и проектные серверы тоже предлагаются. */
  projectPaths: () => string[]
  /** Доверился ли человек папке: .mcp.json недоверенной не читается. */
  isTrusted: (projectPath: string) => Promise<boolean>
  shellEnv: () => Promise<Record<string, string>>
}

/** Чем работает найденный сервер - строкой, для поиска одинаковых. */
const definitionOf = ({ candidate, server }: FoundServer): string =>
  JSON.stringify([candidate.kind, candidate.projectPath, server])

/** Пробовать вход нужно только у сервера по адресу без своих заголовков входа. */
const needsProbe = ({ candidate, server }: FoundServer): boolean =>
  candidate.kind === 'mcp' && !hasHeaders(server)

/**
 * Перенос MCP-серверов из конфига Claude Code в коннекторы (ADR 0029): у Claude в IDE
 * других MCP нет, и без переноса человек потерял бы свои серверы. Конфиг Claude не
 * меняется - терминальный Claude живёт как жил.
 */
export class ImportDesk {
  private found: FoundServer[] = []

  constructor(private readonly host: ImportHost) {}

  async candidates(): Promise<ImportCandidate[]> {
    const env = await this.host.shellEnv()
    const { userConfig, projects } = await readImportSources(
      env,
      this.host.projectPaths(),
      this.host.isTrusted,
    )

    this.found = findServers(userConfig, projects, this.host.serverNames())

    return this.found.map(({ candidate }) => candidate)
  }

  /**
   * Перенести выбранные (по ключу из candidates). Не вышло - имя и причина в skipped.
   * Одинаковые серверы с именами «начало-подпись» (playwright-1, playwright-2) встают одним
   * своим типом «несколько раз» (ADR 0034).
   */
  async import(keys: readonly string[]): Promise<Omit<ImportOutcome, 'state'>> {
    const env = await this.host.shellEnv()
    const chosen = this.found.filter(({ candidate }) => keys.includes(candidate.key))
    const groups = groupByBase(chosen, ({ candidate }) => candidate.serverName, definitionOf)
    const groupTypes = new Map<string, string>()
    const skipped: ImportOutcome['skipped'] = []
    let imported = 0

    for (const found of chosen) {
      const group = groups.get(found) ?? null
      const groupKey = group ? `${definitionOf(found)}\n${group.base}` : null
      const existing = groupKey ? groupTypes.get(groupKey) : undefined
      const typing = { typeId: existing ?? randomUUID(), existing: existing !== undefined }
      const reason = await this.importOne(found, env, group, typing)

      if (reason) skipped.push({ name: found.candidate.name, reason })
      else imported += 1

      // Тип группы заведён первым перенесённым - следующие встают к нему.
      if (!reason && groupKey) groupTypes.set(groupKey, typing.typeId)
    }

    return { imported, skipped }
  }

  /** Один сервер: проба входа, коннектор с типом, добавление. Не вышло - причина кодом. */
  private async importOne(
    found: FoundServer,
    env: Record<string, string>,
    group: { base: string; label: string } | null,
    typing: { typeId: string; existing: boolean },
  ): Promise<ImportSkipReason | null> {
    if (this.host.serverNames().has(found.candidate.serverName)) return 'taken'

    const auth = needsProbe(found) ? await this.probe(found, env) : 'none'

    if (auth === 'unreachable' || auth === 'variable') return auth

    const prepared = importedConnector(found, randomUUID(), auth, env)

    if (typeof prepared === 'string') return prepared

    // Playwright из конфига - подключением встроенного Playwright (ADR 0035), без своего типа.
    const playwright = asPlaywright(prepared.connector, prepared.secrets)
    const error = await this.host.add(
      playwright
        ? { connector: playwright, secrets: prepared.secrets }
        : withImportType(prepared, group, typing),
    )

    if (!error) return null

    if (error === 'vault-unavailable') return error

    return error === 'name-taken' ? 'taken' : 'failed'
  }

  private async probe(
    { server }: FoundServer,
    env: Record<string, string>,
  ): Promise<McpAuth | 'unreachable' | 'variable'> {
    const transport: McpTransport = server.type === 'sse' ? 'sse' : 'http'

    try {
      return await probeAuth(expandConfigVariables(String(server.url), env), transport)
    } catch (error) {
      if (error instanceof MissingVariable) return 'variable'

      return 'unreachable'
    }
  }
}
