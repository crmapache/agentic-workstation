import type { TFunction } from 'i18next'

import type { ScheduleWire } from '@agentic-workstation/remote-protocol/scenario-wire-types'

const MINUTES_IN_DAY = 24 * 60

/** Час запуска словами поля времени: минуты от полуночи - «09:05». */
export const atText = (at: number): string => {
  const safe = Math.min(Math.max(Math.trunc(at), 0), MINUTES_IN_DAY - 1)
  const hours = String(Math.floor(safe / 60)).padStart(2, '0')
  const minutes = String(safe % 60).padStart(2, '0')

  return `${hours}:${minutes}`
}

/** «09:05» из поля времени - минуты от полуночи; не время - null. */
export const atFromText = (value: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim())

  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])

  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null
}

/**
 * Ритм и час одной строкой: «Daily at 09:00», «Mondays at 09:00», «Once at 09:00». Час - по
 * часам Mac: так его считает IDE, и так его ставили.
 */
export const scheduleText = (
  t: TFunction,
  schedule: Pick<ScheduleWire, 'at' | 'repeat' | 'weekday'>,
): string => {
  const time = atText(schedule.at)

  if (schedule.repeat === 'weekly') {
    return t(`schedule.weeklyAt.${schedule.weekday}`, { time, defaultValue: time })
  }

  return t(`schedule.repeatAt.${schedule.repeat}`, { time, defaultValue: time })
}
