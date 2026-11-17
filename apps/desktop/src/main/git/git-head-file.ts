import type { GitHeadFile } from '@shared/git'

import { TEXT_FILE_MAX_BYTES } from '../fs/text-file.constants'
import { errorCode, decodeText, insideRoot, relativeInside } from '../fs/text-file.utils'
import { hasCommits } from './git-head'
import { git, gitBytes } from './git-runner'
import { parseTreeEntries } from './git-tree-output'
import type { TreeEntry } from './git-tree-output'

const MISSING: GitHeadFile = { kind: 'missing' }

/** Ответ execFile, когда вывод вырос за maxBuffer. */
const OVER_BUFFER = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'

/** Записи дерева: путь - буквально, без шаблонов (`[id].tsx` - имя, а не набор букв). */
const listTree = async (rootPath: string, args: string[]): Promise<TreeEntry[]> => {
  const { stdout } = await git(rootPath, ['--literal-pathspecs', 'ls-tree', '-z', '-l', ...args])

  return parseTreeEntries(stdout)
}

const sameName = (left: string, right: string) => left.normalize('NFC') === right.normalize('NFC')

/**
 * Запись файла в HEAD по пути от папки проекта. Сначала прямо по пути - одним вызовом.
 * Не нашлось, а в пути не только ASCII - по папкам сверху, сравнивая имена в NFC: окно
 * присылает путь в NFC, а в старых репозиториях с macOS имена лежат в NFD, и дерево коммита
 * сравнивает байты.
 */
const findEntry = async (rootPath: string, path: string): Promise<TreeEntry | null> => {
  const direct = (await listTree(rootPath, ['HEAD', '--', path])).find((entry) =>
    sameName(entry.path, path),
  )

  // Только печатные ASCII - у имени нет второй формы Unicode, искать дальше нечего.
  if (direct || !/[^ -~]/.test(path)) return direct ?? null

  const segments = path.split('/')
  let tree = 'HEAD:./'

  for (const [index, segment] of segments.entries()) {
    const entry = (await listTree(rootPath, ['--full-tree', tree])).find((candidate) =>
      sameName(candidate.path, segment),
    )

    if (!entry || index === segments.length - 1) return entry ?? null
    if (entry.type !== 'tree') return null

    tree = entry.oid
  }

  return null
}

/**
 * Файл проекта, каким он лежит в последнем коммите, - левая сторона разницы. Путь от окна
 * проверяется и дальше идёт уже проверенным (от корня проекта, через «/»). «Нет в HEAD» -
 * только когда коммитов нет или такой записи нет в дереве; любой другой отказ git - failed,
 * а не «новый файл». Байты - через фильтры git, как при checkout (LFS, свои фильтры,
 * переводы строк autocrlf): слева то же, что было бы на диске, а не указатель LFS. Предел и
 * проверка на текст - как у редактора. Подмодуль - не текст.
 */
export const readHeadFile = async (rootPath: string, windowPath: string): Promise<GitHeadFile> => {
  const path = relativeInside(rootPath, insideRoot(rootPath, windowPath))

  if (path === null || path === '') return MISSING

  try {
    if (!(await hasCommits(rootPath))) return MISSING

    const entry = await findEntry(rootPath, path)

    if (!entry || entry.type === 'tree') return MISSING
    if (entry.type === 'commit') return { kind: 'binary' }

    const size = entry.size ?? 0

    if (size > TEXT_FILE_MAX_BYTES) return { kind: 'tooLarge', size, limit: TEXT_FILE_MAX_BYTES }

    const { stdout } = await gitBytes(
      rootPath,
      ['cat-file', '--filters', `--path=${path}`, entry.oid],
      TEXT_FILE_MAX_BYTES,
    )
    const decoded = decodeText(stdout)

    return decoded ? { kind: 'text', ...decoded } : { kind: 'binary' }
  } catch (error) {
    // Фильтр развернул файл за предел (LFS): сколько вышло - неизвестно, git остановлен.
    if (errorCode(error) === OVER_BUFFER) {
      return { kind: 'tooLarge', size: null, limit: TEXT_FILE_MAX_BYTES }
    }

    console.warn(`[git] ${path} из HEAD не прочитался:`, error)

    return { kind: 'failed' }
  }
}
