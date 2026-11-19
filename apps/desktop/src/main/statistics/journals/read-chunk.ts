import { readSync } from 'node:fs'

import { FLUSH_BYTES } from '../stats.constants'

export const NEWLINE = 0x0a

/**
 * Прочитать с offset кусок до FLUSH_BYTES, кончающийся целой строкой. Строка длиннее куска
 * (бывают по 11 МБ) дочитывается целиком. consumed 0 - в хвосте лишь недописанная строка:
 * провайдер допишет её, и следующий проход прочтёт. Чтение синхронное: сканер живёт в своём
 * потоке, а транзакция куска не должна прерываться await.
 */
export const readChunk = (fd: number, offset: number, size: number) => {
  let length = Math.min(FLUSH_BYTES, size - offset)

  for (;;) {
    const buffer = Buffer.allocUnsafe(length)
    const bytesRead = readSync(fd, buffer, 0, length, offset)
    const data = buffer.subarray(0, bytesRead)
    const end = data.lastIndexOf(NEWLINE)

    if (end !== -1) return { data, consumed: end + 1 }
    if (bytesRead < length || offset + length >= size) return { data, consumed: 0 }

    length = Math.min(length * 2, size - offset)
  }
}
