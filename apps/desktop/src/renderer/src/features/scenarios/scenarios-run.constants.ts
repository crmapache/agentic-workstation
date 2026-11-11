import type { ParseKeys } from 'i18next'

/**
 * Окна лимита по имени CLI - словами окна прогона. Свои ключи, а не панели Claude Code: фича
 * соседнюю не видит, а незнакомое окно таймлайн называет общим «лимитом», не именем CLI.
 */
export const LIMIT_WINDOW_KEYS: Record<string, ParseKeys> = {
  five_hour: 'scenarios.run.limit.windows.fiveHour',
  seven_day: 'scenarios.run.limit.windows.weekly',
  seven_day_opus: 'scenarios.run.limit.windows.weeklyOpus',
  seven_day_sonnet: 'scenarios.run.limit.windows.weeklySonnet',
}

export const SECOND_MS = 1000

export const MINUTE_MS = 60 * SECOND_MS
