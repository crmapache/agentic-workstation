/**
 * Куда идти прогону, которому отказал лимит (LimitRelief в ACC). Порядок: аккаунт, на котором
 * он стоит, если у него снова запас; выбранный человеком; измеренный раньше неизмеренного, из
 * измеренных - наименее потраченный; неизвестный пробуется тоже - отказ стоит один запрос.
 * Двойник отказавшего (тот же вход другим именем) отказывает вместе с ним.
 */

export type ReliefCandidate = {
  id: string
  /** Лимит отказал до этого момента (мс); null - не отказывал. */
  refusedUntil: number | null
  /** Самое полное окно тарифа, проценты; null - не измерен. */
  fullest: number | null
  twinOfHere: boolean
  /** Может ли он модели прогона: false - процесс на нём умрёт на первом сообщении. */
  runs: boolean | null
}

export type ReliefWay = { kind: 'go'; account: string } | { kind: 'wait'; at: number }

/** Сброс не назван - смотреть снова через четверть часа. */
export const UNKNOWN_RESET_MS = 15 * 60 * 1000

/** Не чаще раза в минуту: сброс по часам сервера, ранний запрос получит отказ. */
export const MIN_WAIT_MS = 60 * 1000

/** Запас к сбросу: часы сервера и наши расходятся. */
export const RESET_SLACK_MS = 30_000

export const retryAt = (until: number | null, now: number): number =>
  Math.max(until ?? now + UNKNOWN_RESET_MS, now + MIN_WAIT_MS)

export const chooseRelief = (
  here: string,
  chosen: string,
  candidates: readonly ReliefCandidate[],
  now: number,
): ReliefWay => {
  const hereRefused = candidates.find((one) => one.id === here)?.refusedUntil ?? null
  const refusedUntil = (candidate: ReliefCandidate): number | null =>
    candidate.twinOfHere
      ? Math.max(candidate.refusedUntil ?? 0, hereRefused ?? 0) || null
      : candidate.refusedUntil
  const usable = candidates.filter((one) => one.runs !== false)
  const free = usable.filter((one) => {
    const until = refusedUntil(one)

    return until === null || until <= now
  })
  const rank = (one: ReliefCandidate): number[] => [
    one.id === here ? 0 : 1,
    one.id === chosen ? 0 : 1,
    one.runs === true ? 0 : 1,
    one.fullest === null ? 1 : 0,
    one.fullest ?? 0,
  ]
  const best = [...free].sort((left, right) => {
    const a = rank(left)
    const b = rank(right)
    const at = a.findIndex((value, index) => value !== b[index])

    return at < 0 ? 0 : (a[at] ?? 0) - (b[at] ?? 0)
  })[0]

  if (best) return { kind: 'go', account: best.id }

  const ends = usable.flatMap((one) => {
    const until = refusedUntil(one)

    return until !== null && until > now ? [until] : []
  })

  return { kind: 'wait', at: retryAt(ends.length > 0 ? Math.min(...ends) : null, now) }
}

/**
 * Идти ли за выбором человека: выбор сменился - да; тот же, а прогон на своём - нет; на
 * занятом чужом - вернуться, если на выбранном нет отказа.
 */
export const followsChoice = (
  to: string,
  lastFollowed: string,
  borrowed: boolean,
  refused: boolean,
): boolean => (to !== lastFollowed ? true : borrowed && !refused)
