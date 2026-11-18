import type { TitleSource } from '@shared/claude'
import { OWN_TITLE_MAX, TITLE_SOURCES } from '@shared/claude'

/** Пробелы, переводы строк и управляющие символы: в имени вкладки это пробел. */
const BREAKS = /[\s\p{Cc}]+/gu

/** Сколько стоит имя: заглушка 0, догадка 1, имя от модели 2, имя от человека 3. */
export const rankOf = (source: TitleSource): number => TITLE_SOURCES.indexOf(source)

/**
 * Перебивает ли новое имя то, что вкладка уже носит. Порядок прихода имён не равен их
 * весу: догадка по первому сообщению появляется сразу, имя от модели - через секунду,
 * а имя от человека CLI потом повторяет сам. Равный ранг перебивает: модель могла
 * назвать разговор заново.
 */
export const outranks = (next: TitleSource, current: TitleSource): boolean =>
  rankOf(next) >= rankOf(current)

/**
 * Имя, набранное человеком, в том виде, в каком его носит вкладка: одна строка без
 * управляющих символов, до OWN_TITLE_MAX знаков (по кодовым точкам - эмодзи пополам не
 * режется). null - от имени ничего не осталось, вкладка оставляет прежнее.
 */
export const ownTitle = (text: string): string | null => {
  const line = text.replace(BREAKS, ' ').trim()

  if (!line) return null

  return Array.from(line).slice(0, OWN_TITLE_MAX).join('').trimEnd()
}
