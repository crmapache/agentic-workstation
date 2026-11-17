import { stat, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'

import type { PathLocation } from '@shared/fs'
import { opensAsImage } from '@shared/preview-images'

import { fitsImageTab } from './image-file'
import { insideRoot, rankByName, readWrittenPath } from './path-location'
import { toWindowPath } from './project-paths'
import { opensAsText } from './text-file'

type EntryKind = 'file' | 'folder'

const MISSING: PathLocation = { kind: 'missing' }

/**
 * Больше одноимённых файлов на выбор не предлагаем: `index.ts` бывает в сотнях мест,
 * а такой список не читают - дописывают папку к имени.
 */
const CHOICE_LIMIT = 50

/**
 * Регистр в именах - как у файловой системы: на маке `readme.md` - это `README.md`, на
 * Linux - нет.
 */
const CASE_SENSITIVE = process.platform === 'linux'

/** Что лежит по пути, по ссылкам до цели. Сокет, устройство, канал - не цель клика. */
const entryKind = async (absolutePath: string): Promise<EntryKind | null> => {
  try {
    const info = await stat(absolutePath)

    if (info.isDirectory()) return 'folder'

    return info.isFile() ? 'file' : null
  } catch {
    return null
  }
}

const realOrNull = (path: string) => realpath(path).catch(() => null)

/**
 * Путь от корня, если цель в проекте. Сначала по настоящим путям: они дают регистр
 * имён, как на диске (`app.tsx` → `App.tsx`, иначе дерево не найдёт строку), и сводят
 * `/tmp` и `/private/tmp`. Не вышло - по написанному: ссылка внутри проекта, ведущая
 * наружу, - всё равно строка дерева проекта.
 */
const projectPathOf = async (rootPath: string, absolutePath: string): Promise<string | null> => {
  const [realRoot, realTarget] = await Promise.all([realOrNull(rootPath), realOrNull(absolutePath)])
  const real = realRoot && realTarget ? insideRoot(realRoot, realTarget) : null

  return real ?? insideRoot(rootPath, absolutePath)
}

/** Откроет ли вкладка IDE файл вне проекта: картинку - картинкой, остальное - если это текст. */
const opensInTab = (absolute: string): Promise<boolean> =>
  opensAsImage(absolute) ? fitsImageTab(absolute) : opensAsText(absolute)

/**
 * Куда ведёт путь из текста ленты: файл или папка проекта, что-то вне проекта (у файла -
 * откроет ли его вкладка IDE), выбор из нескольких одноимённых или ничего. Сначала - как написан (от корня или
 * абсолютный), потом, если относительный и там пусто, - по имени среди файлов проекта
 * (listFiles - тот же список, что кормит «@»; спрашиваем его только на промахе).
 */
export const locatePath = async (
  rootPath: string,
  path: string,
  listFiles: () => Promise<readonly string[]>,
  homePath = homedir(),
): Promise<PathLocation> => {
  const target = readWrittenPath(path, rootPath, homePath)

  if (!target) return MISSING

  const kind = await entryKind(target.absolutePath)

  if (kind) {
    const relativePath = await projectPathOf(rootPath, target.absolutePath)

    if (relativePath !== null) {
      return kind === 'file'
        ? { kind: 'projectFile', relativePath }
        : { kind: 'projectFolder', relativePath }
    }

    // В NFC, как пути дерева: один файл из ссылки агента и из Finder - одна вкладка.
    const absolutePath = toWindowPath(target.absolutePath)

    return kind === 'file'
      ? { kind: 'outsideFile', absolutePath, opensInTab: await opensInTab(target.absolutePath) }
      : { kind: 'outsideFolder', absolutePath }
  }

  if (!target.byName) return MISSING

  const candidates = rankByName(target.written, await listFiles(), CASE_SENSITIVE)
  const [only] = candidates

  if (candidates.length === 1 && only !== undefined)
    return { kind: 'projectFile', relativePath: only }

  return candidates.length > 1
    ? { kind: 'choose', candidates: candidates.slice(0, CHOICE_LIMIT) }
    : MISSING
}
