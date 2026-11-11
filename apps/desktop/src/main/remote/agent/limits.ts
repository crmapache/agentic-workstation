import { COMMAND_LIMITS } from '@agentic-workstation/remote-protocol/commands'
import {
  MESSAGE_LIMITS,
  HANDSHAKE_LIMITS,
} from '@agentic-workstation/remote-protocol/phone-messages'

/** Окно счёта - минута. */
export const WINDOW_MS = 60_000

/** Ничто честное с телефона не весит больше кадра: фото идёт частями, каждая - отдельно. */
export const MAX_MESSAGE_BYTES = 256 * 1024

/** И сколько за минуту: самое тяжёлое честное - сообщение с фото и его повтор после обрыва. */
export const MAX_BYTES_PER_MINUTE = 8 * 1024 * 1024

/** Чему нет своего числа - строже всего: незнакомое не должно быть дешёвым. */
const FALLBACK_PER_MINUTE = 10

const PER_MINUTE: Readonly<Record<string, number>> = {
  ...COMMAND_LIMITS,
  ...MESSAGE_LIMITS,
  ...HANDSHAKE_LIMITS,
}

/**
 * Сколько раз в минуту телефон может просить одно и то же (числа - в протоколе), и сколько
 * байт он шлёт. Счёт по телефону и виду, вес - отдельно: сотня мелких и одно огромное - разное.
 */
export class RemoteLimits {
  private readonly windows = new Map<string, number[]>()
  private readonly volume = new Map<string, { at: number; bytes: number }[]>()

  allow(deviceId: string, kind: string, now = Date.now()): boolean {
    const limit = PER_MINUTE[kind] ?? FALLBACK_PER_MINUTE
    const key = `${deviceId}\0${kind}`
    const recent = (this.windows.get(key) ?? []).filter((at) => now - at <= WINDOW_MS)

    if (recent.length >= limit) {
      this.windows.set(key, recent)

      return false
    }

    this.windows.set(key, [...recent, now])

    return true
  }

  allowBytes(deviceId: string, bytes: number, now = Date.now()): boolean {
    if (bytes > MAX_MESSAGE_BYTES) return false

    const recent = (this.volume.get(deviceId) ?? []).filter((entry) => now - entry.at <= WINDOW_MS)
    const total = recent.reduce((sum, entry) => sum + entry.bytes, 0)

    if (total + bytes > MAX_BYTES_PER_MINUTE) {
      this.volume.set(deviceId, recent)

      return false
    }

    this.volume.set(deviceId, [...recent, { at: now, bytes }])

    return true
  }

  /** Телефона больше нет - его счётчики не должны занимать место. */
  forget(deviceId: string): void {
    for (const key of this.windows.keys())
      if (key.startsWith(`${deviceId}\0`)) this.windows.delete(key)

    this.volume.delete(deviceId)
  }
}
