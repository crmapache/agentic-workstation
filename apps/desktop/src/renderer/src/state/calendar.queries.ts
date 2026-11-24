import type { CalendarState } from '@shared/calendar'
import type { CalendarSettings } from '@shared/calendar-settings'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'

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

/**
 * Накладки впереди с обеими встречами и отметкой «видел» (ADR 0116). Ключ держит ревизию и
 * отметки: события или отметки поменялись - список новый. Минута - чтобы прошедшие уходили.
 */
export const useCalendarOverlaps = () => {
  const state = useCalendar().data

  return useQuery({
    queryKey: QUERY_KEYS.calendarOverlaps(
      state?.revision ?? 0,
      (state?.seenOverlaps ?? []).join('\n'),
    ),
    queryFn: () => invoke('calendar:overlaps'),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
}

/** Настройки календаря (Settings → Calendar): ответ - состояние целиком, сразу в кэш. */
export const useSetCalendarSettings = (): ((
  settings: Partial<CalendarSettings>,
) => Promise<CalendarState>) => {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (settings: Partial<CalendarSettings>) =>
      invoke('calendar:setSettings', { settings }),
    onSuccess: (state) => queryClient.setQueryData(QUERY_KEYS.calendar, state),
  })

  return save.mutateAsync
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
