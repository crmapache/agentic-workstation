import { useMemo, useEffect } from 'react'

import type { CalendarEvent, CalendarSourceView } from '@shared/calendar'
import { meetingsOf, overlapsOf } from '@shared/calendar-overlaps'
import { useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { QUERY_KEYS } from '../../state/query-keys'

/**
 * Вид открыли: прямые источники, прочитанные давно, главный процесс читает заново. Ответ -
 * состояние, оно сразу в кэш.
 */
export const useCalendarViewed = () => {
  const queryClient = useQueryClient()

  useEffect(() => {
    void invoke('calendar:viewed').then((state) =>
      queryClient.setQueryData(QUERY_KEYS.calendar, state),
    )
  }, [queryClient])
}

/** Встречи периода (дубли слиты) и их накладки - теми же правилами, что у главного процесса. */
export const useMeetings = (
  events: readonly CalendarEvent[],
  sources: readonly CalendarSourceView[],
) =>
  useMemo(() => {
    const meetings = meetingsOf(
      events,
      sources.map((source) => source.id),
    )
    const counts = (id: string) => sources.find((source) => source.id === id)?.inOverlaps === true

    return { meetings, overlaps: overlapsOf(meetings, counts) }
  }, [events, sources])
