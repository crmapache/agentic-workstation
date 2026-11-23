import type { CalendarSourceView } from '@shared/calendar'
import { isAiSourceKind } from '@shared/calendar'

import type { SourceStatus } from './SourcesPanel.types'

/**
 * Что сказать под источником: читается (и кем), ждёт очереди, почему не прочитался, когда
 * прочитан в последний раз. Сбой главнее старой удачи: человеку важнее, что сейчас не так.
 */
export const sourceStatus = (source: CalendarSourceView): SourceStatus => {
  const { sync } = source

  if (sync.phase === 'running') {
    return {
      key: isAiSourceKind(source.kind) ? 'calendar.status.reading' : 'calendar.status.syncing',
      tone: 'busy',
    }
  }
  if (sync.phase === 'queued') return { key: 'calendar.status.queued', tone: 'busy' }
  if (sync.failure) return { key: `calendar.failures.${sync.failure}`, tone: 'danger' }
  if (sync.warning) return { key: 'calendar.status.suspiciousEmpty', tone: 'warning' }

  return sync.lastOkAt === null
    ? { key: 'calendar.status.never', tone: 'muted' }
    : { key: 'calendar.status.synced', values: { count: sync.count }, tone: 'muted' }
}
