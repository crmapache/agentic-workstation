import { HIDDEN_ENTRY_NAMES } from './directory-reader.constants'
import { toWindowRelative } from './project-paths'
import { GIT_DIR_FILES, GIT_DIR_FOLDERS, GIT_SUBMODULE_STATE } from './project-watcher.constants'

/**
 * Что значит одно событие слежения. path - где оно в файлах проекта (от корня, через
 * «/»), null - не в них (внутри .git). renamed - путь появился, пропал или
 * переименовался: поменялся список папки над ним, а если это папка - всё, что под ней,
 * читалось по старому месту. rescan - место неизвестно, перечитать всё. git -
 * поменялось важное в .git.
 */
export type WatchChange = {
  path: string | null
  renamed: boolean
  rescan: boolean
  git: boolean
}

/** Без имени файла событие ничего не говорит о месте - считаем, что поменялось всё. */
const UNKNOWN_CHANGE: WatchChange = { path: null, renamed: false, rescan: true, git: true }

const GIT_CHANGE: WatchChange = { path: null, renamed: false, rescan: false, git: true }

/**
 * Событие fs.watch в корне проекта. rename у macOS - появился, пропал или
 * переименовался; change - поменялось только содержимое. .git в дереве не
 * показывается, служебное macOS (.DS_Store) - тоже, его события не важны. .git
 * вложенного репозитория - не наш: не трогает ни дерево, ни наш статус.
 */
export const classifyProjectEvent = (
  eventType: string,
  filename: string | null,
): WatchChange | null => {
  if (filename === null) return UNKNOWN_CHANGE

  const path = toWindowRelative(filename)
  const parts = path.split('/')

  if (parts[0] === '.git') return classifyGitDirEvent(parts.slice(1).join('/'))
  if (parts.some((part) => HIDDEN_ENTRY_NAMES.has(part))) return null

  return { path, renamed: eventType === 'rename', rescan: false, git: false }
}

/** Событие внутри папки .git (путь от неё): важно только то, что меняет статус и ветку. */
export const classifyGitDirEvent = (filename: string): WatchChange | null => {
  const path = toWindowRelative(filename)

  return GIT_DIR_FILES.has(path) ||
    GIT_DIR_FOLDERS.some((folder) => path.startsWith(folder)) ||
    GIT_SUBMODULE_STATE.test(path)
    ? GIT_CHANGE
    : null
}

/**
 * Событие в папке над проектом, между ним и корнем репозитория: важен только её
 * .gitignore - его правила красят файлы проекта.
 */
export const classifyOuterIgnoreEvent = (filename: string | null): WatchChange | null =>
  filename === '.gitignore' ? GIT_CHANGE : null
