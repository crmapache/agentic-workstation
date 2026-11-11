import type { StatsScanProgress } from '@shared/statistics'

import type { EngineOp, EngineOps, EngineRequest } from '../stats-engine'
import { StatsEngine } from '../stats-engine'

/** Связь сервиса с движком статистики: в потоке (приложение) или прямо в процессе (тесты). */
export type EngineLink = {
  request<K extends EngineOp>(request: EngineRequest<K>): Promise<EngineOps[K]['response']>
  close(): Promise<void>
}

/** Как поднять связь: путь базы и куда слать ход чтения транскриптов. */
export type EngineLinkFactory = (
  dbPath: string,
  onProgress: (progress: StatsScanProgress) => void,
) => EngineLink

/** Сообщение в поток: запрос с номером, ответ придёт с тем же номером. */
export type WorkerInbound = { id: number; request: EngineRequest }

/** Сообщение из потока: ход чтения или ответ на запрос. */
export type WorkerOutbound =
  | { type: 'progress'; progress: StatsScanProgress }
  | { type: 'reply'; id: number; ok: true; result: unknown }
  | { type: 'reply'; id: number; ok: false; error: string }

/** Путь базы для потока (workerData). */
export type WorkerData = { dbPath: string }

/**
 * Движок прямо в процессе: для тестов сервиса. В приложении так нельзя - синхронный
 * node:sqlite остановил бы окно на время выборки.
 */
export const inlineEngineLink: EngineLinkFactory = (dbPath, onProgress) => {
  const engine = new StatsEngine(dbPath, onProgress)

  return {
    request: (request) => engine.handle(request),
    close: () => {
      engine.close()

      return Promise.resolve()
    },
  }
}
