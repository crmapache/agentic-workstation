import { join } from 'node:path'

import { loginShellEnv } from '../process/shell-env'
import { claudeHome } from '../claude/history/transcript-paths'
import type { StatsServiceDeps } from './stats-service'
import { StatsService } from './stats-service'
import type { EngineLinkFactory } from './engine/engine-link'
import scanWorkerPath from './engine/scan-worker?modulePath'
import { WorkerEngineLink } from './engine/worker-engine-link'
import type { ScanSource } from './journals/journal-format'
import { scanSourcesOf } from './journals/scan-sources'

/**
 * Движок в своём потоке. electron-vite собирает scan-worker.ts отдельным файлом рядом с
 * бандлом главного процесса (импорт ?modulePath) и отдаёт путь к нему. Этот файл не
 * импортируется тестами: vitest такого импорта не знает, тесты берут inlineEngineLink.
 */
export const workerEngineLink: EngineLinkFactory = (dbPath, onProgress) =>
  new WorkerEngineLink(scanWorkerPath, dbPath, onProgress)

/**
 * Журналы всех провайдеров на этой машине: транскрипты Claude Code (CLAUDE_CONFIG_DIR или
 * ~/.claude), журналы Codex, базы OpenCode - IDE и человека.
 */
export const providerSources = async (dataDir: string): Promise<ScanSource[]> =>
  scanSourcesOf(await loginShellEnv(), dataDir, join(await claudeHome(), 'projects'))

/** Сервис статистики приложения: база в dataDir (userData), журналы провайдеров, движок в потоке. */
export const createStatsService = (
  deps: Omit<StatsServiceDeps, 'link' | 'sources'> & Partial<Pick<StatsServiceDeps, 'sources'>>,
): StatsService =>
  new StatsService({
    sources: () => providerSources(deps.dataDir),
    ...deps,
    link: workerEngineLink,
  })
