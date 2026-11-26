import { useMemo, useEffect } from 'react'

import type { CalendarEvent, CalendarSourceView } from '@shared/calendar'
import { isAhead, meetingsOf, overlapsOf } from '@shared/calendar-overlaps'
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

/**
 * Встречи периода (дубли слиты) и их накладки - теми же правилами, что у главного процесса.
 * overlaps - только впереди и идущие (прошедшие уже не разруливают), вместе с просмотренными;
 * active - те из них, что человек ещё не отметил «видел»: только они горят на сетке.
 */
export const useMeetings = (
  events: readonly CalendarEvent[],
  sources: readonly CalendarSourceView[],
  seen: readonly string[],
  now: number,
) => {
  const { meetings, all } = useMemo(() => {
    const found = meetingsOf(
      events,
      sources.map((source) => source.id),
    )
    const counts = (id: string) => sources.find((source) => source.id === id)?.inOverlaps === true

    return { meetings: found, all: overlapsOf(found, counts) }
  }, [events, sources])

  return useMemo(() => {
    const overlaps = all.filter((overlap) => isAhead(overlap, now))

    return { meetings, overlaps, active: overlaps.filter((one) => !seen.includes(one.key)) }
  }, [meetings, all, seen, now])
}
