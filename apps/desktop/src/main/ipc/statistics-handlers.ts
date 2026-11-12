import type { StatsSource, StatsManualNote, StatsPresenceNote } from '@shared/statistics'
import type { ManualEntry, StatisticsInvokeContract } from '@shared/ipc/statistics.contract'

import type { StatsService } from '../statistics/stats-service'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { InvokeHandlers } from './handle'
import { assertOneOf } from './validate'
import { projectRootOf } from './workspace-handlers'

type StatisticsChannels = keyof StatisticsInvokeContract

/** Пачка окна - не больше часа минут и сотни строк правок: больше за полминуты не бывает. */
const MAX_ENTRIES = 600

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0

const listOf = (value: unknown): unknown[] =>
  Array.isArray(value) ? value.slice(0, MAX_ENTRIES) : []

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Каналы статистики: проверить запрос, превратить id проектов в пути и позвать сервис. */
export const createStatisticsHandlers = (
  workspace: WorkspaceService,
  stats: StatsService,
): Pick<InvokeHandlers, StatisticsChannels> => {
  /** Путь открытого проекта; закрытый за это время - пусто, такую запись просто отбросим. */
  const pathOf = (projectId: unknown): string =>
    typeof projectId === 'string' ? (workspace.findProject(projectId)?.rootPath ?? '') : ''

  return {
    'stats:report': ({ period, source, projectId }) => {
      if (!isRecord(period)) throw new Error('Ожидался период')

      return stats.query(
        { from: count(period.from), to: count(period.to) },
        {
          source: assertOneOf<StatsSource>(source, ['all', 'ide', 'outside'], 'source'),
          project: projectId === null ? null : projectRootOf(workspace, projectId),
        },
      )
    },
    'stats:scan': () => stats.progress,
    'stats:noteActivity': ({ presence, manual }) => {
      const minutes: StatsPresenceNote[] = listOf(presence).flatMap((entry) =>
        isRecord(entry) ? [{ minute: count(entry.minute), project: pathOf(entry.projectId) }] : [],
      )
      const edits: StatsManualNote[] = listOf(manual).flatMap((entry) => {
        const row = isRecord(entry) ? (entry as Partial<ManualEntry>) : null
        const project = row ? pathOf(row.projectId) : ''

        return row && project
          ? [
              {
                minute: count(row.minute),
                project,
                ext: typeof row.ext === 'string' ? row.ext.slice(0, 16) : '',
                typed: count(row.typed),
                pasted: count(row.pasted),
                added: count(row.added),
                removed: count(row.removed),
              },
            ]
          : []
      })

      if (minutes.length > 0) stats.notePresence(minutes)
      if (edits.length > 0) stats.noteManual(edits)
    },
  }
}
