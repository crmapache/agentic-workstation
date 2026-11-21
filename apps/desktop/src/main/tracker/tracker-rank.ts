/**
 * Место в списке строкой (дробный порядок): новая карточка между двумя получает строку между их
 * строками, соседи не переписываются. Перенос на другом компьютере тогда не спорит с переносом
 * здесь - меняется одно поле одной записи. Строки сравниваются как есть; последняя цифра никогда
 * не '0', поэтому между любыми двумя соседями место есть всегда.
 */

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'
const BASE = DIGITS.length

const digitAt = (text: string, index: number, fallback: number) => {
  if (index >= text.length) return fallback

  const digit = DIGITS.indexOf(text.charAt(index))

  return digit < 0 ? fallback : digit
}

/** Строка строго между after и before; null - край списка. */
export const rankBetween = (after: string | null, before: string | null): string => {
  const low = after ?? ''
  let high = before
  let out = ''

  for (let index = 0; ; index += 1) {
    const lowDigit = digitAt(low, index, 0)
    const highDigit = high === null ? BASE : digitAt(high, index, BASE)

    if (lowDigit === highDigit) {
      out += DIGITS.charAt(lowDigit)

      continue
    }

    const middle = Math.floor((lowDigit + highDigit) / 2)

    if (middle > lowDigit) return out + DIGITS.charAt(middle)

    // Соседние цифры: берём нижнюю, дальше верхняя граница уже не держит.
    out += DIGITS.charAt(lowDigit)
    high = null
  }
}

/** Порядок по месту, при равном месте (две вставки с разных компьютеров) - по id. */
export const byRank = <T extends { rank: string; id: string }>(a: T, b: T): number =>
  a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/**
 * Место для вставки перед beforeId в упорядоченном списке (без самого переносимого): null -
 * в конец. beforeId, которого в списке нет, - тоже в конец.
 */
export const rankBefore = (
  list: readonly { id: string; rank: string }[],
  beforeId: string | null,
): string => {
  const index = beforeId === null ? -1 : list.findIndex((item) => item.id === beforeId)

  if (index < 0) return rankBetween(list.at(-1)?.rank ?? null, null)

  return rankBetween(list[index - 1]?.rank ?? null, list[index]?.rank ?? null)
}
