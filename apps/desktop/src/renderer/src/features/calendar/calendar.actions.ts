import type {
  CalendarState,
  CalendarOutcome,
  CalendarSourceDraft,
  CalendarSourcePatch,
} from '@shared/calendar'
import { useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { QUERY_KEYS } from '../../state/query-keys'

/**
 * Действия календаря: ответ главного процесса - новое состояние, оно сразу в кэш. Синк идёт в
 * главном процессе: уход на другой вид его не останавливает.
 */
export const useCalendarActions = () => {
  const queryClient = useQueryClient()
  const took = (state: CalendarState) => {
    queryClient.setQueryData(QUERY_KEYS.calendar, state)
  }

  return {
    sync: async (sourceId: string | null, withAi = true) =>
      took(await invoke('calendar:sync', { sourceId, withAi })),
    cancel: async (sourceId: string | null) => took(await invoke('calendar:cancel', { sourceId })),
    patch: async (id: string, patch: CalendarSourcePatch) =>
      took(await invoke('calendar:patchSource', { id, patch })),
    remove: async (id: string) => took(await invoke('calendar:removeSource', { id })),
    markOverlap: async (key: string, seen: boolean) =>
      took(await invoke('calendar:markOverlap', { key, seen })),
    save: async (source: CalendarSourceDraft): Promise<CalendarOutcome> => {
      const outcome = await invoke('calendar:saveSource', { source })

      if (outcome.ok) took(outcome.state)

      return outcome
    },
  }
}
