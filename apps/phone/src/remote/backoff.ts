import { CLOSE_UNPROVEN, CLOSE_WRONG_KIND } from '@agentic-workstation/remote-protocol/relay-claim'

/**
 * Сбой связи с релеем - три поведения, а не один цикл повторов: сеть мигнула - короткая пауза,
 * релей нездоров - пауза до потолка, отказ по существу - стоп и слово человеку. И отдельно -
 * «адрес занял другой» (4009): та же страница, открытая второй вкладкой, - ограниченное число
 * возвратов, иначе две вкладки вытесняют друг друга вечно.
 */
export type Failure = 'network' | 'relay' | 'fatal' | 'displaced'

export const BASE_MS = 1_000

/** Сеть телефона мигает часто (лифт, метро), и обычно ответ - «уже вернулась». */
export const NETWORK_CEILING_MS = 30_000

/** Лежащий релей незачем спрашивать каждые полминуты. */
export const RELAY_CEILING_MS = 120_000

const MAX_SHIFT = 8

const JITTER = 0.25

/** «Приходи позже» по стандарту WebSocket. */
export const TRY_AGAIN_LATER = 1013

/** Слишком много кадров в минуту - правило релея; повтор сразу упрётся в него же. */
export const POLICY_VIOLATION = 1008

/** Адрес занял другой сокет (apps/relay/src/hub.ts). */
export const CLOSE_DISPLACED = 4009

/**
 * Повтор ничего не изменит: адрес не адрес, версию релей не знает, подпись адреса не сошлась,
 * адрес держит соединение другого вида (relay-claim.ts). «Не успели доказать» (4004) - сеть.
 */
export const FATAL_CODES: readonly number[] = [4001, 4002, CLOSE_UNPROVEN, CLOSE_WRONG_KIND]

export const DISPLACED_LIMIT = 3

export const DISPLACED_PAUSE_MS = 5_000

/** Что значит код закрытия. У браузера ответа HTTP на апгрейд не видно - без кода это сеть. */
export const classifyClose = (code: number): Failure => {
  if (code === CLOSE_DISPLACED) return 'displaced'
  if (FATAL_CODES.includes(code)) return 'fatal'
  if (code === TRY_AGAIN_LATER || code === POLICY_VIOLATION) return 'relay'

  return 'network'
}

/** Счётчик попыток и пауза до следующей; null - больше не пробовать сам, ждать человека. */
export class Backoff {
  private attempts = 0
  private displacements = 0

  constructor(private readonly random: () => number = Math.random) {}

  next(failure: Failure): number | null {
    if (failure === 'fatal') return null

    if (failure === 'displaced') {
      this.displacements += 1

      return this.displacements > DISPLACED_LIMIT ? null : this.jittered(DISPLACED_PAUSE_MS)
    }

    this.attempts += 1

    const ceiling = failure === 'relay' ? RELAY_CEILING_MS : NETWORK_CEILING_MS

    return this.jittered(Math.min(BASE_MS * 2 ** Math.min(this.attempts - 1, MAX_SHIFT), ceiling))
  }

  /** Сокет открылся - отсчёт сети заново. */
  succeeded(): void {
    this.attempts = 0
  }

  /** Человек вернулся к странице или нажал «переподключить» - всё с нуля. */
  reset(): void {
    this.attempts = 0
    this.displacements = 0
  }

  /** Разброс: иначе все телефоны, потерявшие релей, вернулись бы в одну секунду. */
  private jittered(ideal: number): number {
    const spread = Math.floor(ideal * JITTER)

    return ideal - spread + Math.floor(this.random() * (2 * spread + 1))
  }
}
