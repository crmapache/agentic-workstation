import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { FS_CONCURRENCY, BINARY_SNIFF_BYTES } from '../search/search.constants'
import { GIT_LINES_FILE_MAX_BYTES } from './git.constants'

/** Что известно о файле: по размеру и времени правки видно, что его не меняли. */
type Counted = { size: number; mtimeMs: number; lines: number }

const NEWLINE = 0x0a

/**
 * Строки текста, как их считает `git diff --numstat`: последняя без перевода строки - тоже
 * строка. Двоичный (ноль в первых 8000 байтах, как у git) - null.
 */
export const countTextLines = (bytes: Buffer): number | null => {
  if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return null

  let lines = 0

  for (let at = bytes.indexOf(NEWLINE); at !== -1; at = bytes.indexOf(NEWLINE, at + 1)) lines += 1

  return bytes.length > 0 && bytes.at(-1) !== NEWLINE ? lines + 1 : lines
}

/**
 * Строки файла по его записи на диске. Ссылка у git - одна строка с путём, куда она ведёт, без
 * перевода строки. Не файл, огромный и двоичный - ноль.
 */
const linesOnDisk = async (path: string, isLink: boolean, size: number): Promise<number> => {
  if (isLink) return 1
  if (size > GIT_LINES_FILE_MAX_BYTES) return 0

  return countTextLines(await readFile(path)) ?? 0
}

/**
 * Строки новых файлов, которых git ещё не знает: `git diff HEAD` их не видит, а в счёте
 * строк проекта они - добавленные. Файл читается, только если поменялись его размер или
 * время правки: счёт идёт на каждую правку в проекте, а новых файлов бывают тысячи. Один
 * счётчик - на проект, вызовы - по одному (их ведёт сервис статуса).
 */
export class FileLineCounter {
  private known = new Map<string, Counted>()

  /**
   * Строк во всех файлах (пути от корня проекта). Пропавший или нечитаемый файл - ноль. Что
   * не попало в этот список, забывается: файл добавили в git или удалили.
   */
  async count(rootPath: string, paths: readonly string[]): Promise<number> {
    const next = new Map<string, Counted>()
    let total = 0

    for (let index = 0; index < paths.length; index += FS_CONCURRENCY) {
      const batch = paths.slice(index, index + FS_CONCURRENCY).map((path) => join(rootPath, path))
      const counted = await Promise.all(batch.map((path) => this.countFile(path)))

      for (const [position, entry] of counted.entries()) {
        const path = batch[position]

        if (!entry || path === undefined) continue

        next.set(path, entry)
        total += entry.lines
      }
    }

    this.known = next

    return total
  }

  private async countFile(path: string): Promise<Counted | null> {
    try {
      const stats = await lstat(path)
      const known = this.known.get(path)

      if (known?.size === stats.size && known.mtimeMs === stats.mtimeMs) return known
      if (!stats.isFile() && !stats.isSymbolicLink()) return null

      const lines = await linesOnDisk(path, stats.isSymbolicLink(), stats.size)

      return { size: stats.size, mtimeMs: stats.mtimeMs, lines }
    } catch {
      // Файл успели удалить или его не прочитать - строк у него нет.
      return null
    }
  }
}
