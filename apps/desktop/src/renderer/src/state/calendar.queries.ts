import type { CalendarState } from '@shared/calendar'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'

import { invoke } from '../lib/ipc'
import { useIpcEvent } from '../lib/ipc.hooks'
import { QUERY_KEYS } from './query-keys'

/** Календарь звонков (ADR 0114): источники, их синк и настройки. Владелец - главный процесс. */
export const useCalendar = () =>
  useQuery({
    queryKey: QUERY_KEYS.calendar,
    queryFn: () => invoke('calendar:state'),
    staleTime: Infinity,
  })

/**
 * События видимых источников за период. Ключ держит ревизию: события поменялись - запрос
 * новый, а пока он идёт, на сетке остаются прежние (без мигания пустотой).
 */
export const useCalendarEvents = (from: number, to: number) => {
  const revision = useCalendar().data?.revision ?? 0

  return useQuery({
    queryKey: QUERY_KEYS.calendarEvents(from, to, revision),
    queryFn: () => invoke('calendar:events', { from, to }),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  })
}

/** Календари аккаунта Google коннектора - для формы источника. */
export const useGoogleCalendars = (connectorId: string | null) =>
  useQuery({
    queryKey: QUERY_KEYS.calendarGoogle(connectorId ?? ''),
    queryFn: () => invoke('calendar:googleCalendars', { connectorId: connectorId ?? '' }),
    enabled: connectorId !== null,
  })

/** Подписка календаря, одна на окно: состояние - в кэш, события перечитает новая ревизия. */
export const useCalendarSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('calendar:changed', (state) => {
    queryClient.setQueryData<CalendarState>(QUERY_KEYS.calendar, state)
  })
}
