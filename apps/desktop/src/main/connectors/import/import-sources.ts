import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { ShellVariables } from '../command-line'
import type { ProjectServers, McpJsonApprovals } from './import-candidates'
import { strings } from './import-candidates'

const readJson = async (path: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Где живёт конфиг Claude Code: CLAUDE_CONFIG_DIR, а без неё - домашняя папка. */
const configDirOf = (env: ShellVariables): string | null => env['CLAUDE_CONFIG_DIR'] ?? null

/**
 * Решения Claude Code о серверах .mcp.json: одобренные (enabledMcpjsonServers или
 * enableAllProjectMcpServers) и отклонённые (disabledMcpjsonServers) - из записи проекта в
 * ~/.claude.json и из настроек: своих (.claude/settings.local.json), проекта и общих.
 * Отклонение где угодно - отклонение.
 */
const approvalsOf = (records: readonly unknown[]): McpJsonApprovals => {
  const found = records.filter(isRecord)

  return {
    enabled: new Set(found.flatMap((record) => strings(record['enabledMcpjsonServers']))),
    disabled: new Set(found.flatMap((record) => strings(record['disabledMcpjsonServers']))),
    all: found.some((record) => record['enableAllProjectMcpServers'] === true),
  }
}

/** Что импорту читать: конфиг Claude Code человека и серверы открытых проектов. */
export type ImportSources = { userConfig: unknown; projects: ProjectServers[] }

/**
 * Прочитать конфиг Claude Code и серверы открытых проектов. .mcp.json - только у папки,
 * которой человек доверился: иначе его не открывает и сам Claude Code.
 */
export const readImportSources = async (
  env: ShellVariables,
  projectPaths: readonly string[],
  isTrusted: (projectPath: string) => Promise<boolean>,
): Promise<ImportSources> => {
  const configDir = configDirOf(env)
  const userConfig = await readJson(join(configDir ?? homedir(), '.claude.json'))
  const userSettings = await readJson(
    join(configDir ?? join(homedir(), '.claude'), 'settings.json'),
  )
  const entries =
    isRecord(userConfig) && isRecord(userConfig['projects']) ? userConfig['projects'] : {}
  const projects = await Promise.all(
    projectPaths.map(async (path): Promise<ProjectServers> => {
      const entry = entries[path]
      const trusted = await isTrusted(path)
      const [mcpJson, local, shared] = trusted
        ? await Promise.all([
            readJson(join(path, '.mcp.json')),
            readJson(join(path, '.claude', 'settings.local.json')),
            readJson(join(path, '.claude', 'settings.json')),
          ])
        : [null, null, null]

      return {
        path,
        local: isRecord(entry) ? entry['mcpServers'] : null,
        mcpJson,
        approvals: approvalsOf([entry, local, shared, userSettings]),
      }
    }),
  )

  return { userConfig, projects }
}
