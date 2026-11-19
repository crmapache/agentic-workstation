import type { CarryOnPlan, CarryOnReason } from '@shared/panel-extras'

import {
  LIMIT_TRIES,
  MIN_WAIT_MS,
  LIMIT_WAIT_MS,
  RESET_SLACK_MS,
  HELPERS_QUIET_MS,
  UNKNOWN_RESET_MS,
} from './panel.constants'

/**
 * Работа, которую остановил не человек, и что панель ей должна (как в ACC, accounts.md):
 * смена аккаунта прервала ход - продолжить сразу; лимит отказал - в момент сброса плюс
 * запас, без названного сброса - через 15 минут, не дольше 6 часов и не больше трёх
 * отказов подряд; перезапуск убил фоновых агентов - продолжить. Здесь только решения -
 * арифметика над состоянием, чтобы у каждой дороги был тест.
 */
export type Owed = {
  reason: CarryOnReason
  /** Не раньше этого момента (мс): сброс лимита; null - сразу. */
  notBefore: number | null
  /** Аккаунт, чей лимит пережидаем (только limit). */
  account: string | null
  /** Лимит не сказал, когда сбросится: момент - догадка, когда попробовать. */
  guess: boolean
  /** По дороге погибли фоновые агенты - слова скажут и это. */
  helpersLost: boolean
  /** Вкладка с тех пор переехала на другой аккаунт. */
  moved: boolean
  /** Сколько своих продолжений подряд лимит уже отказал. */
  tries: number
  /**
   * Человек сказал «нет» («Don't continue», Stop): в конце ожидания панель молчит, но
   * ожидание лимита остаётся - очередь написана, чтобы уйти после сброса.
   */
  silent: boolean
}

/** Долг с этой причиной и полями по умолчанию. */
export const owedFor = (reason: CarryOnReason, change: Partial<Owed> = {}): Owed => ({
  reason,
  notBefore: null,
  account: null,
  guess: false,
  helpersLost: false,
  moved: false,
  tries: 0,
  silent: false,
  ...change,
})

export const isDue = (owed: Owed, now: number): boolean =>
  owed.notBefore === null || owed.notBefore <= now

/** План на экране: тихое ожидание - не план, прошедший момент - тоже. */
export const shownPlan = (owed: Owed | null, now: number): CarryOnPlan | undefined =>
  owed && !owed.silent && owed.notBefore !== null && owed.notBefore > now
    ? { until: owed.notBefore, guess: owed.guess }
    : undefined

/**
 * Две причины одной вкладки - одной. Слова смены аккаунта покрывают всё; перезапуск
 * поверх ожидания лимита его не торопит (лимит всё ещё отказывает), но слова скажут о
 * погибших агентах; новое ожидание лимита заменяет старое и помнит потерянное и «нет»
 * человека.
 */
export const mergedOwed = (old: Owed, next: Owed): Owed => {
  if (next.reason === 'accountSwitch') return next
  if (old.reason === 'accountSwitch') return old
  if (next.reason === 'restart') return { ...old, helpersLost: true }

  return {
    ...next,
    helpersLost: next.helpersLost || old.helpersLost,
    silent: next.silent || (old.silent && old.reason === 'limit'),
  }
}

/** Когда снова пробовать отказ, который кончается в until: без него - через 15 минут. */
export const retryAt = (until: number | null, now: number): number =>
  Math.max(until ?? now + UNKNOWN_RESET_MS, now + MIN_WAIT_MS)

/**
 * Ожидание, которого требует отказ лимита аккаунту. known - когда отказ кончится, если
 * сказано; previous - что панель сказала последним, пока ничего не прошло. null - не
 * ждать: дольше шести часов или уже три своих продолжения подряд отказаны.
 */
export const limitWait = (
  now: number,
  known: number | null,
  previous: Owed | null,
  account: string,
): Owed | null => {
  if (known !== null && known - now > LIMIT_WAIT_MS) return null

  const tries = previous?.reason === 'limit' ? previous.tries + 1 : 0

  if (tries >= LIMIT_TRIES) return null

  return owedFor('limit', {
    notBefore: retryAt(known, now) + RESET_SLACK_MS,
    account,
    guess: known === null,
    tries,
  })
}

/**
 * Ожидание лимита, когда вкладка встала на другой аккаунт to (другую подписку): сразу,
 * если он не отказывает; к концу его отказа, если близко; null - отказ на дни.
 */
export const limitAcross = (
  owed: Owed,
  to: string,
  refusedUntil: number | null,
  now: number,
): Owed | null => {
  const moved = { ...owed, account: to, moved: true, guess: false }

  if (refusedUntil === null || refusedUntil <= now) return { ...moved, notBefore: null }
  if (refusedUntil - now <= LIMIT_WAIT_MS) {
    return { ...moved, notBefore: refusedUntil + RESET_SLACK_MS }
  }

  return null
}

/**
 * Работали ли фоновые агенты, когда процесс ушёл: счёт застревает (агент кончился без
 * отчёта), и вкладка с призраком с утра начинала бы работу вечером. lastHeard - последний
 * знак от агентов; ничего не слышали - не знак.
 */
export const helpersAtWork = (pending: boolean, lastHeard: number, now: number): boolean =>
  pending && lastHeard > 0 && now - lastHeard < HELPERS_QUIET_MS
