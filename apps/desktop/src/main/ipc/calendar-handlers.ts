import { parseSourceDraft, parseSourcePatch, parseCalendarSettings } from '@shared/calendar-parse'
import { DAY_MS } from '@shared/time-units'
import type { CalendarInvokeContract } from '@shared/ipc/calendar.contract'

import type { CalendarRuntime } from '../calendar/calendar-setup'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'

type CalendarChannels = keyof CalendarInvokeContract

/** Период событий за раз: месяц на сетке - до шести недель, и час запаса на перевод часов. */
const EVENTS_SPAN_MAX = 43 * DAY_MS

const moment = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} - не время`)

  return value
}

const idOrNull = (value: unknown): string | null => {
  if (value === null) return null

  assertString(value, 'sourceId')

  return value
}

/** Каналы календаря (ADR 0114): проверить запрос и позвать сервис или движок синка. */
export const createCalendarHandlers = (
  calendar: CalendarRuntime,
): Pick<InvokeHandlers, CalendarChannels> => {
  const { service, sync } = calendar

  return {
    'calendar:state': () => service.state(),
    'calendar:events': ({ from, to }) => {
      const start = moment(from, 'from')
      const end = moment(to, 'to')

      if (end <= start || end - start > EVENTS_SPAN_MAX) throw new Error('Период событий не тот')

      return service.eventsIn(start, end)
    },
    'calendar:saveSource': async ({ source }) => {
      const draft = parseSourceDraft(source)

      if (!draft) return { ok: false, code: 'invalid' }

      const { outcome, changed } = await service.save(draft)

      // Новый источник или другой календарь - читается сразу, и ИИ тоже: человек только что
      // настроил его и ждёт, что прочитается.
      if (outcome.ok && changed) sync.sync(outcome.id, true)

      return outcome.ok ? { ...outcome, state: service.state() } : outcome
    },
    'calendar:patchSource': ({ id, patch }) => {
      assertString(id, 'id')

      return service.patch(id, parseSourcePatch(patch))
    },
    'calendar:removeSource': ({ id }) => {
      assertString(id, 'id')
      sync.cancel(id)

      return service.remove(id)
    },
    'calendar:sync': ({ sourceId, withAi }) => {
      sync.sync(idOrNull(sourceId), withAi === true)

      return service.state()
    },
    'calendar:cancel': ({ sourceId }) => {
      sync.cancel(idOrNull(sourceId))

      return service.state()
    },
    'calendar:setSettings': ({ settings }) =>
      service.setSettings(parseCalendarSettings(settings, service.settings)),
    'calendar:viewed': () => {
      sync.viewed()

      return service.state()
    },
    'calendar:googleCalendars': ({ connectorId }) => {
      assertString(connectorId, 'connectorId')

      return calendar.googleCalendars(connectorId)
    },
    'calendar:overlaps': () => service.overlapsAhead(),
    'calendar:markOverlap': ({ key, seen }) => {
      assertString(key, 'key')

      return service.markOverlap(key, seen === true)
    },
    'calendar:overlapBrief': ({ key }) => {
      assertString(key, 'key')

      return service.overlapBrief(key)
    },
  }
}
