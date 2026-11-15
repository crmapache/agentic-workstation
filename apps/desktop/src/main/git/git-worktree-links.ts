import { stat, lstat, mkdir, unlink, symlink, copyFile, readFile, realpath } from 'node:fs/promises'
import { sep, join, posix, dirname } from 'node:path'

import { IS_WINDOWS } from '../platform'
import { keepIgnored } from './git-worktree-include'

/**
 * Файл в корне репозитория со списком того, что в новый worktree не копировать, а
 * связать ссылкой с проектом. Свой формат IDE: в .worktreeinclude Claude Code такой
 * строки нет, и его собственный --worktree принял бы её за шаблон копирования.
 */
export const WORKTREE_LINK_FILE = '.worktreelink'

/**
 * Локальные файлы самого Claude Code: личные правила проекта и его локальные
 * настройки (разрешения, хуки). Без них сценарий в worktree работает не по тем
 * правилам, что в папке проекта, поэтому они связываются в любом проекте, даже без
 * списка. Ссылкой, а не копией: разрешение, выданное в worktree, и правка правил
 * посреди очереди должны попасть в один файл.
 */
const CLAUDE_LOCAL_FILE = 'CLAUDE.local.md'
const CLAUDE_LOCAL_SETTINGS = '.claude/settings.local.json'

/** Путь от корня репозитория, который не уходит наружу и не трогает .git. */
const isSafeRelative = (path: string) => {
  if (path.length === 0 || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false

  const normalized = posix.normalize(path)
  const segments = normalized.split('/')

  return normalized !== '.' && !segments.includes('..') && segments[0] !== '.git'
}

/**
 * Строки списка: путь от корня репозитория на строку - файл или папка целиком,
 * `#` - комментарий. Шаблонов нет намеренно: ссылка ставится на то, что названо, а не
 * на всё, что совпало. Обратные слэши и слэш на конце приводятся к одному виду.
 */
export const parseLinkList = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => posix.normalize(line.replace(/\\/g, '/')).replace(/\/+$/, ''))
    .filter(isSafeRelative)

/**
 * Путь внутри другого пути из того же набора. Его ссылка встала бы уже за ссылкой на
 * папку - в самом проекте, и замена «копии» стёрла бы там настоящий файл.
 */
const isNestedIn = (path: string, paths: string[]) =>
  paths.some((other) => other !== path && path.startsWith(`${other}/`))

/**
 * Что связывать: локальные файлы Claude Code и строки списка, без повторов и без
 * путей внутри другого пути набора - папка, связанная целиком, уже несёт их.
 * CLAUDE.local.md Claude Code читает в папке проекта и в каждой папке выше до корня
 * репозитория, настройки - только в папке проекта. prefix - путь проекта внутри
 * репозитория, как его даёт `git rev-parse --show-prefix` (`packages/app/` или пусто).
 */
export const linkCandidates = (prefix: string, listed: string[]): string[] => {
  const project = prefix.replace(/\/+$/, '')
  const folders: string[] = []

  for (let folder = project; folder !== '.' && folder !== ''; folder = posix.dirname(folder)) {
    folders.push(folder)
  }

  const claudeFiles = [
    posix.join(project, CLAUDE_LOCAL_SETTINGS),
    ...folders.map((folder) => posix.join(folder, CLAUDE_LOCAL_FILE)),
    CLAUDE_LOCAL_FILE,
  ]

  const unique = [...new Set([...claudeFiles, ...listed])]

  return unique.filter((path) => !isNestedIn(path, unique))
}

const readLinkList = async (repoRoot: string) => {
  try {
    return parseLinkList(await readFile(join(repoRoot, WORKTREE_LINK_FILE), 'utf8'))
  } catch {
    return []
  }
}

/** Есть ли у ссылки цель: stat идёт по ссылкам, сломанная ссылка в проекте - не цель. */
const existsInProject = async (path: string) => {
  try {
    await stat(path)

    return true
  } catch {
    return false
  }
}

/**
 * Можно ли поставить ссылку на место target в worktree: места нет или там файл -
 * копия из .worktreeinclude (ссылка её заменит) или отслеживаемый (его отсеет
 * проверка игнора). Папку не заменяем: в ней могут быть отслеживаемые файлы.
 */
const isPlaceable = async (target: string, relative: string) => {
  try {
    if (!(await lstat(target)).isDirectory()) return true

    console.warn(`[git] ${WORKTREE_LINK_FILE}: в worktree уже есть папка ${relative}, не связываю`)

    return false
  } catch {
    return true
  }
}

const filterAsync = async <T>(items: T[], keep: (item: T) => Promise<boolean>) => {
  const kept = await Promise.all(items.map(keep))

  return items.filter((_, index) => kept[index])
}

/** Ближайшая существующая папка над путём - без ссылок, как её видит система. */
const realFolderAbove = async (path: string): Promise<string> => {
  const folder = dirname(path)

  try {
    return await realpath(folder)
  } catch (error) {
    if (dirname(folder) === folder) throw error

    return realFolderAbove(folder)
  }
}

/**
 * Одна ссылка. Сначала - что путь не уходит из worktree через ссылку, которая там уже
 * есть (отслеживаемая в репозитории или поставленная этим же списком): иначе замена
 * «копии» стёрла бы настоящий файл в чужой папке. Папка на Windows - junction: обычная
 * ссылка там требует прав администратора или режима разработчика. Ссылку на файл без
 * них Windows не даст - тогда копия: файл хотя бы будет на месте, хоть и не общий.
 */
const placeLink = async ({
  source,
  target,
  relative,
  root,
}: {
  source: string
  target: string
  relative: string
  root: string
}) => {
  const above = await realFolderAbove(target)

  if (above !== root && !above.startsWith(`${root}${sep}`)) {
    throw new Error(`${relative} ведёт за пределы worktree (${above})`)
  }

  const isFolder = (await stat(source)).isDirectory()

  await mkdir(dirname(target), { recursive: true })
  await unlink(target).catch(() => undefined)

  try {
    await symlink(source, target, isFolder ? (IS_WINDOWS ? 'junction' : 'dir') : 'file')
  } catch (error) {
    if (isFolder || !IS_WINDOWS) throw error

    await copyFile(source, target)
    console.warn(`[git] ${WORKTREE_LINK_FILE}: ${relative} скопирован, ссылку Windows не дал`)
  }
}

/**
 * Ставит в новом worktree ссылки на файлы и папки проекта, которые checkout не
 * приносит, а сценарий должен делить с папкой проекта: локальные файлы Claude Code и
 * строки .worktreelink (журналы, черновики - то, что прогон пишет и что должно
 * пережить worktree). Ставится только то, что есть в проекте и что git в worktree
 * игнорирует как ссылку: иначе ссылка стала бы новым файлом в git status - worktree
 * перестал бы удаляться сам, а коммит агента мог бы её унести. Удаление worktree
 * снимает ссылки, а не то, на что они указывают (проверено на настоящем git).
 *
 * Сбой не отменяет worktree: он уже рабочий, причина - в журнал. Итог - сколько
 * путей поставлено.
 */
export const linkWorktreeShared = async ({
  repoRoot,
  prefix,
  worktreePath,
}: {
  repoRoot: string
  prefix: string
  worktreePath: string
}) => {
  try {
    const wanted = linkCandidates(prefix, await readLinkList(repoRoot))
    const present = await filterAsync(wanted, (relative) =>
      existsInProject(join(repoRoot, relative)),
    )
    const placeable = await filterAsync(present, (relative) =>
      isPlaceable(join(worktreePath, relative), relative),
    )
    const ignored = new Set(await keepIgnored(worktreePath, placeable))

    const root = await realpath(worktreePath)
    let placed = 0

    for (const relative of placeable) {
      if (!ignored.has(relative)) {
        // Частая причина - шаблон со слэшем на конце: `dir/` видит папку, но не ссылку.
        console.warn(`[git] ${WORKTREE_LINK_FILE}: git не игнорирует ${relative} как ссылку`)
        continue
      }

      try {
        const source = join(repoRoot, relative)

        await placeLink({ source, target: join(worktreePath, relative), relative, root })
        placed += 1
      } catch (error) {
        console.warn(`[git] ${WORKTREE_LINK_FILE}: не связался ${relative}:`, error)
      }
    }

    return placed
  } catch (error) {
    console.warn(`[git] ${WORKTREE_LINK_FILE}: ссылки в worktree не поставлены:`, error)

    return 0
  }
}
