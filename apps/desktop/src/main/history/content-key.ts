import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { deflateRaw, inflateRaw } from 'node:zlib'

const deflate = promisify(deflateRaw)
const inflate = promisify(inflateRaw)

/**
 * Ключ содержимого - тот же, что у объекта git (sha1 от «blob <длина>\0» и байтов). Поэтому
 * версию, которая уже лежит в репозитории проекта (закоммиченный файл, файл другой ветки),
 * история не копирует к себе: её отдаёт git по тому же ключу.
 */
export const contentKey = (bytes: Buffer): string =>
  createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')

/** Ключ, который прислало окно: 40 шестнадцатеричных знаков, как у объекта git. */
export const isContentKey = (value: string): boolean => /^[0-9a-f]{40}$/.test(value)

/** Сжатое содержимое для базы: код и тексты сжимаются в разы. Не в главном потоке. */
export const packContent = (bytes: Buffer): Promise<Buffer> => deflate(bytes)

export const unpackContent = (packed: Uint8Array): Promise<Buffer> => inflate(packed)
