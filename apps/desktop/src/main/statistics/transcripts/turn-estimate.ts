import { IDLE_GAP_MS } from '../stats.constants'

/** Отрезок активности одного файла сессии (основной транскрипт или субагент). */
export type SessionSpan = { start: number; end: number; place: number | null }

/** Начало хода: сообщение человека (human) или ход, начатый не человеком. */
export type TurnStart = { ts: number; human: boolean }

/** Кусок оценённого хода: время работы агента без пауз. */
export type TurnSegment = { start: number; end: number; place: number | null }

/** Есть ли начало хода в (after, upTo]: промежуток перед ним - ожидание, а не работа. */
const startWithin = (starts: readonly TurnStart[], after: number, upTo: number): boolean => {
  let low = 0
  let high = starts.length

  // Первое начало строго после after.
  while (low < high) {
    const middle = (low + high) >> 1

    if ((starts[middle]?.ts ?? 0) <= after) low = middle + 1
    else high = middle
  }

  return low < starts.length && (starts[low]?.ts ?? Infinity) <= upTo
}

/**
 * Время работы агентов сессии по транскриптам, когда живых часов IDE нет. Ход - от
 * сообщения человека до последней записи перед следующим; промежутки между записями
 * складываются, но не длиннее IDLE_GAP_MS (дольше - человек ушёл, разговор лежал) и не
 * перед началом хода. Записи основного транскрипта и субагентов (они идут параллельно)
 * объединяются, а не складываются: это один ход.
 *
 * Ответ - куски ходов, разрезанные по сообщениям человека: их сумма - работа, а их
 * объединение по всем сессиям - «настенное» время, где паузы уже не лежат.
 */
export const estimateTurns = (
  spans: readonly SessionSpan[],
  starts: readonly TurnStart[],
  gapMs = IDLE_GAP_MS,
): TurnSegment[] => {
  const ordered = [...spans].sort((a, b) => a.start - b.start)
  const turnStarts = [...starts].sort((a, b) => a.ts - b.ts)
  const merged: TurnSegment[] = []

  for (const span of ordered) {
    const last = merged.at(-1)
    const bridges =
      last !== undefined &&
      (span.start <= last.end ||
        (span.start - last.end <= gapMs && !startWithin(turnStarts, last.end, span.start)))

    if (bridges) last.end = Math.max(last.end, span.end)
    else merged.push({ ...span })
  }

  const humans = turnStarts.filter((start) => start.human).map((start) => start.ts)
  const segments: TurnSegment[] = []

  for (const piece of merged) {
    let start = piece.start

    // Субагент, работавший через сообщение человека, делит кусок: дальше уже новый ход.
    for (const cut of humans) {
      if (cut <= start || cut >= piece.end) continue

      segments.push({ start, end: cut, place: piece.place })
      start = cut
    }

    segments.push({ start, end: piece.end, place: piece.place })
  }

  return segments.filter((segment) => segment.end > segment.start)
}
