import type { Dirent } from 'node:fs'
import { lstat, readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { toWindowPath, toWindowRelative } from '../fs/project-paths'
import { SKIPPED_DIRECTORY_NAMES } from '../search/search.constants'
import { contentKey } from './content-key'
import type { FileRow } from './history-store'
import { HISTORY_FILE_MAX_BYTES } from './history.constants'

/**
 * Что сверка увидела на месте файла. same - сведения с диска те же, что история помнит;
 * file - файл и его содержимое; folder - папка; missing - ничего нет (или имя другим
 * регистром - это уже другой путь); untracked - файл истории не нужен (больше предела,
 * ссылка); unreadable - есть, но не читается (нет прав): ничего не решаем.
 */
export type Observation =
  | { kind: 'same' }
  | { kind: 'file'; key: string; size: number; mtimeMs: number }
  | { kind: 'folder' }
  | { kind: 'missing' }
  | { kind: 'untracked' }
  | { kind: 'unreadable' }

/**
 * Точные имена в папках - на одну сверку. APFS находит файл и по имени другим регистром:
 * после «foo.ts → Foo.ts» (или «Src → src») старый путь ещё открывается, и без сверки имён
 * история решила бы, что файлов два. Индекс git с core.ignorecase тоже помнит прежний регистр.
 * Сверяется каждая часть пути от корня проекта, папка читается один раз.
 */
export class NameCheck {
  private readonly folders = new Map<string, Promise<string[]>>()

  constructor(private readonly root: string) {}

  /** Путь от корня с точно такими именами, как на диске, - или нет (missing). */
  async exists(absolute: string): Promise<boolean> {
    const parts = toWindowRelative(relative(this.root, absolute)).split('/')

    for (const [index, part] of parts.entries()) {
      const names = await this.names(join(this.root, ...parts.slice(0, index)))

      if (!names.includes(part)) return false
    }

    return true
  }

  /**
   * Путь от корня с именами, как они лежат на диске: «src/app.ts» из индекса git после «mv
   * src/app.ts src/App.ts» - это «src/App.ts». Части, которой нет даже без учёта регистра, -
   * как есть.
   */
  async onDisk(path: string): Promise<string> {
    const real: string[] = []

    for (const part of toWindowPath(path).split('/')) {
      const names = await this.names(join(this.root, ...real))
      const lower = part.toLowerCase()

      real.push(
        names.includes(part) ? part : (names.find((name) => name.toLowerCase() === lower) ?? part),
      )
    }

    return real.join('/')
  }

  private names(folder: string): Promise<string[]> {
    let names = this.folders.get(folder)

    if (!names) {
      names = readdir(folder).then(
        (entries) => entries.map(toWindowPath),
        () => [],
      )
      this.folders.set(folder, names)
    }

    return names
  }
}

/**
 * Первый взгляд на путь - без чтения содержимого: что там и сколько байт придётся прочитать.
 * known - каким история знает путь (неизменившийся по сведениям с диска не читается); names
 * - сверять ли точное имя в папке.
 */
export type Peek = { seen: Observation } | { read: { size: number; mtimeMs: number } }

export const peek = async (
  absolute: string,
  known: FileRow | undefined,
  names: NameCheck | null,
): Promise<Peek> => {
  const info = await lstat(absolute).catch(() => null)

  if (!info || (names && !(await names.exists(absolute)))) return { seen: { kind: 'missing' } }
  if (info.isDirectory()) return { seen: { kind: 'folder' } }
  if (!info.isFile() || info.size > HISTORY_FILE_MAX_BYTES) return { seen: { kind: 'untracked' } }
  if (known?.size === info.size && known.mtimeMs === info.mtimeMs) return { seen: { kind: 'same' } }

  return { read: { size: info.size, mtimeMs: info.mtimeMs } }
}

/** Увиденное и байты прочитанного файла: их сохраняют сразу, а дальше по сверке едет только ключ. */
export type Sighting = { seen: Observation; bytes: Buffer | null }

/** Прочитать файл после первого взгляда: ключ содержимого и сами байты. */
export const readSighting = async (absolute: string, mtimeMs: number): Promise<Sighting> => {
  const bytes = await readFile(absolute).catch(() => null)

  if (!bytes) return { seen: { kind: 'unreadable' }, bytes: null }

  return { seen: { kind: 'file', key: contentKey(bytes), size: bytes.length, mtimeMs }, bytes }
}

/**
 * Файлы папки, которая появилась целиком (её перенесли в проект, распаковали): события
 * слежения называют только саму папку. Пути - от корня, через «/», в NFC. Без .git и ссылок;
 * вне git (skipHeavy) - и без папок, которые обход поиска без git пропускает (зависимости,
 * сборки, кэши): в git их судит .gitignore. Больше max - null, обход останавливается сразу:
 * такую папку разбирает полная сверка проекта.
 */
export const filesInFolder = async (
  root: string,
  absolute: string,
  max: number,
  skipHeavy: boolean,
): Promise<string[] | null> => {
  const files: string[] = []
  const queue = [absolute]

  for (let folder = queue.shift(); folder !== undefined; folder = queue.shift()) {
    const entries: Dirent[] = await readdir(folder, { withFileTypes: true }).catch(() => [])

    for (const entry of entries) {
      const path = join(folder, entry.name)

      const heavy = skipHeavy && SKIPPED_DIRECTORY_NAMES.has(entry.name)

      if (entry.isDirectory() && entry.name !== '.git' && !heavy) {
        queue.push(path)
      } else if (entry.isFile()) {
        if (files.length >= max) return null

        files.push(toWindowRelative(relative(root, path)))
      }
    }
  }

  return files
}
