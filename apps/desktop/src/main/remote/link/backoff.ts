import { CLOSE_UNPROVEN, CLOSE_WRONG_KIND } from '@agentic-workstation/remote-protocol/relay-claim'

/**
 * Сбой связи с релеем - три поведения, а не один цикл повторов (как Backoff в ACC):
 * сеть мигнула - короткая пауза; релей нездоров - пауза до потолка; отказ по существу -
 * стоп и слово человеку. И отдельно - «адрес занял другой» (код 4009): несколько быстрых
 * возвратов, потом долгая пауза, но не стоп. Две IDE на одном адресе (копия профиля на
 * втором Mac) иначе вытесняли бы друг друга каждые пять секунд, а сдавшаяся IDE не вернулась
 * бы и тогда, когда вторая давно выключена.
 */
export type Failure = 'network' | 'relay' | 'fatal' | 'displaced'

export const BASE_MS = 1_000

/** Сеть мигает часто, ответ обычно «уже вернулась». */
export const NETWORK_CEILING_MS = 60_000

/** Лежащий релей незачем спрашивать каждую минуту. */
export const RELAY_CEILING_MS = 300_000

const MAX_SHIFT = 8

const JITTER = 0.25

/** «Приходи позже» по стандарту WebSocket. */
export const TRY_AGAIN_LATER = 1013

/** Адрес занял другой сокет - собственный код релея (apps/relay/src/hub.ts). */
export const CLOSE_DISPLACED = 4009

/**
 * Повтор ничего не изменит: адрес не адрес, версию не знаем, подпись адреса не сошлась, адрес
 * держит соединение другого вида (relay-claim.ts). «Не успели доказать» (4004) - это сеть.
 */
export const FATAL_CODES: readonly number[] = [4001, 4002, CLOSE_UNPROVEN, CLOSE_WRONG_KIND]

/** Сколько быстрых возвратов после вытеснения - дальше долгая пауза. */
export const DISPLACED_LIMIT = 5

export const DISPLACED_PAUSE_MS = 5_000

/** Пауза после серии вытеснений: вторая IDE на адресе держит его, мы спрашиваем изредка. */
export const DISPLACED_LONG_PAUSE_MS = 5 * 60_000

/** Что значит код закрытия; без ответа HTTP за ним это почти всегда сеть. */
export const classifyClose = (code: number): Failure => {
  if (code === CLOSE_DISPLACED) return 'displaced'
  if (FATAL_CODES.includes(code)) return 'fatal'
  if (code === TRY_AGAIN_LATER) return 'relay'

  return 'network'
}

/** Счётчик попыток и пауза до следующей; null - больше не пробовать, решает человек. */
export class Backoff {
  private attempts = 0
  private displacements = 0

  constructor(private readonly random: () => number = Math.random) {}

  get attemptCount(): number {
    return this.attempts
  }

  next(failure: Failure): number | null {
    if (failure === 'fatal') return null

    if (failure === 'displaced') {
      this.displacements += 1

      return this.jittered(
        this.displacements > DISPLACED_LIMIT ? DISPLACED_LONG_PAUSE_MS : DISPLACED_PAUSE_MS,
      )
    }

    this.attempts += 1

    const ceiling = failure === 'relay' ? RELAY_CEILING_MS : NETWORK_CEILING_MS

    return this.jittered(Math.min(BASE_MS * 2 ** Math.min(this.attempts - 1, MAX_SHIFT), ceiling))
  }

  /** Сокет открылся - отсчёт заново. */
  succeeded(): void {
    this.attempts = 0
  }

  /**
   * Линия простояла долго - вытеснение снова считается с нуля. Не в момент открытия:
   * сокет, который сейчас вытеснят, первые секунды выглядит здоровым.
   */
  heldOn(): void {
    this.displacements = 0
  }

  /** Разброс: иначе все IDE, потерявшие релей, вернулись бы в одну секунду и уронили его снова. */
  private jittered(ideal: number): number {
    const spread = Math.floor(ideal * JITTER)

    return ideal - spread + Math.floor(this.random() * (2 * spread + 1))
  }
}
