import { offsetAt } from '@shared/zone-time'

/**
 * Пояс человека для модели (ADR 0132). Команды, журналы, серверы и API печатают время в UTC, и
 * модель пересказывает его как есть: «стартовали в 16:43 UTC» человеку в Коста-Рике, которому
 * нужно «в 10:43». Сама она пояса не знает - CLI даёт ей только дату. Поэтому IDE называет пояс
 * каждой сессии, которую поднимает, и просит писать время в нём.
 */

/** Пояс этого компьютера (IANA); Intl без пояса - UTC. */
export const machineTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/**
 * Строка указаний про пояс. Одна строка без кавычек и апострофов: она уходит и аргументом
 * `--append-system-prompt`. Смещение - на момент подъёма сессии, название пояса - чтобы модель
 * сама учла перевод часов в долгом разговоре.
 */
export const localTimeBriefing = (
  now: Date = new Date(),
  timeZone: string = machineTimeZone(),
): string =>
  `The person is in the time zone ${timeZone} (UTC${offsetAt(now, timeZone)} now). Show them every date and time in this zone as plain local time, converting what commands, logs, servers and APIs print in UTC or in other zones. Name UTC or another zone only when the context calls for it (a server, cron job or config that runs on that zone, people in another zone) or when the person asks for it, and then give the local time next to it.`

/** Указания сессии с поясом человека в конце; пустые указания - только пояс. */
export const withLocalTime = (briefing: string, now?: Date, timeZone?: string): string =>
  [briefing, localTimeBriefing(now, timeZone)].filter(Boolean).join(' ')
