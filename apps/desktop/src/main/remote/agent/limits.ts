import { parseCommand, COMMAND_LIMITS } from '@agentic-workstation/remote-protocol/commands'
import { MAX_PARTS, PART_CHARS } from '@agentic-workstation/remote-protocol/parts'
import type { CmdMessage } from '@agentic-workstation/remote-protocol/phone-messages'
import {
  MESSAGE_LIMITS,
  HANDSHAKE_LIMITS,
} from '@agentic-workstation/remote-protocol/phone-messages'

/** Окно счёта - минута: за неё ведро наполняется целиком. */
export const WINDOW_MS = 60_000

/** Ничто честное с телефона не весит больше кадра: фото идёт частями, каждая - отдельно. */
export const MAX_MESSAGE_BYTES = 256 * 1024

/**
 * Кусок сообщения на проводе: текст куска и обёртка слова part (вид, id, номера) с запасом на
 * экранирование кавычек текста внутри JSON.
 */
const PART_FRAME_BYTES = PART_CHARS + 2048

/** Самое тяжёлое честное сообщение - фото во всех кусках, сколько их допускает протокол. */
export const MAX_PHOTO_MESSAGE_BYTES = MAX_PARTS * PART_FRAME_BYTES

/**
 * Сколько байт в минуту: три самых тяжёлых сообщения с фото (два фото подряд и повтор
 * оборвавшегося) и сверху мегабайт на всё остальное - стук, подписки, команды.
 */
export const MAX_BYTES_PER_MINUTE = 3 * MAX_PHOTO_MESSAGE_BYTES + 1024 * 1024

/** Чему нет своего числа - строже всего: незнакомое не должно быть дешёвым. */
const FALLBACK_PER_MINUTE = 10

const PER_MINUTE: Readonly<Record<string, number>> = {
  ...COMMAND_LIMITS,
  ...MESSAGE_LIMITS,
  ...HANDSHAKE_LIMITS,
}

/** Вид для предела частоты у команд не из белого списка или с кривыми аргументами. */
export const REFUSED_KIND = 'cmd.refused'

/**
 * Под каким видом считается команда: своим именем, а отказы (незнакомое имя, кривые
 * аргументы) - одной кучей и строго: поток незнакомых команд - не человек печатает.
 */
export const limitKindOf = (message: CmdMessage): string =>
  parseCommand(message.name, message.args).ok ? message.name : REFUSED_KIND

/** Ведро: сколько ещё можно и когда считали. Наполняется ровно, до capacity за минуту. */
type Bucket = { tokens: number; at: number; capacity: number }

const refill = (bucket: Bucket, now: number): number =>
  Math.min(
    bucket.capacity,
    bucket.tokens + (Math.max(0, now - bucket.at) * bucket.capacity) / WINDOW_MS,
  )

/** Взять cost из ведра; не хватает - отказ, и ведро не тратится. Работа постоянная на кадр. */
const take = (
  buckets: Map<string, Bucket>,
  key: string,
  capacity: number,
  cost: number,
  now: number,
): boolean => {
  const bucket = buckets.get(key) ?? { tokens: capacity, at: now, capacity }
  const tokens = refill(bucket, now)
  const allowed = tokens >= cost

  bucket.tokens = allowed ? tokens - cost : tokens
  bucket.at = now
  buckets.set(key, bucket)

  return allowed
}

/**
 * Сколько раз в минуту телефон может просить одно и то же (числа - в протоколе), и сколько
 * байт он шлёт. Счёт по телефону и виду, вес - отдельно: сотня мелких и одно огромное - разное.
 * Ведро на телефон и вид, а не список времён: проверка кадра не зависит от того, сколько их
 * было за минуту.
 */
export class RemoteLimits {
  private readonly counts = new Map<string, Bucket>()
  private readonly volume = new Map<string, Bucket>()

  allow(deviceId: string, kind: string, now = Date.now()): boolean {
    const limit = PER_MINUTE[kind] ?? FALLBACK_PER_MINUTE

    return take(this.counts, `${deviceId}\0${kind}`, limit, 1, now)
  }

  allowBytes(deviceId: string, bytes: number, now = Date.now()): boolean {
    if (bytes > MAX_MESSAGE_BYTES) return false

    return take(this.volume, deviceId, MAX_BYTES_PER_MINUTE, bytes, now)
  }

  /**
   * Полное ведро - то же, что его нет: оно уходит, и память не растёт от телефонов, которых
   * больше нет. Отзыв телефона вёдра не трогает: отозванный и тут же спаренный заново не
   * получает свежую квоту на то, что уже прислал.
   */
  sweep(now = Date.now()): void {
    for (const buckets of [this.counts, this.volume]) {
      for (const [key, bucket] of buckets) {
        if (refill(bucket, now) >= bucket.capacity) buckets.delete(key)
      }
    }
  }

  /** Сколько вёдер живо - для теста уборки. */
  size(): number {
    return this.counts.size + this.volume.size
  }
}
