import type { NativeTool } from '../native-tools'
import type { Calendar } from './calendar-api'
import { CALENDAR_READ_TOOLS } from './calendar-read-tools'
import { CALENDAR_WRITE_TOOLS } from './calendar-write-tools'

/** Инструменты Google Calendar: чтение, потом запись (calendar-read-tools, calendar-write-tools). */
export const CALENDAR_TOOLS: NativeTool<Calendar>[] = [
  ...CALENDAR_READ_TOOLS,
  ...CALENDAR_WRITE_TOOLS,
]
