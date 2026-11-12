import { join } from 'node:path'

import { claudeHome } from '../claude/history/transcript-paths'
import type { StatsServiceDeps } from './stats-service'
import { StatsService } from './stats-service'
import type { EngineLinkFactory } from './engine/engine-link'
import scanWorkerPath from './engine/scan-worker?modulePath'
import { WorkerEngineLink } from './engine/worker-engine-link'

/**
 * Движок в своём потоке. electron-vite собирает scan-worker.ts отдельным файлом рядом с
 * бандлом главного процесса (импорт ?modulePath) и отдаёт путь к нему. Этот файл не
 * импортируется тестами: vitest такого импорта не знает, тесты берут inlineEngineLink.
 */
export const workerEngineLink: EngineLinkFactory = (dbPath, onProgress) =>
  new WorkerEngineLink(scanWorkerPath, dbPath, onProgress)

/** Транскрипты Claude Code: projects/ в доме CLI (CLAUDE_CONFIG_DIR или ~/.claude). */
export const claudeProjectsDir = async (): Promise<string> => join(await claudeHome(), 'projects')

/** Сервис статистики приложения: база в dataDir (userData), транскрипты CLI, движок в потоке. */
export const createStatsService = (
  deps: Omit<StatsServiceDeps, 'link' | 'projectsDir'> &
    Partial<Pick<StatsServiceDeps, 'projectsDir'>>,
): StatsService =>
  new StatsService({ projectsDir: claudeProjectsDir, ...deps, link: workerEngineLink })
