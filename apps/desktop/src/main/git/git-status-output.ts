import type { GitStatus, GitPathStatus, GitFolderChange } from '@shared/git'

import { toWindowPath } from '../fs/project-paths'

/** Что случилось с путём: свой статус или удаление (в дереве его нет, но папка изменена). */
type PathChange = GitPathStatus | 'deleted'

/** Сколько полей через пробел стоит перед путём в записях porcelain v2. */
export const FIELDS_BEFORE_PATH: Record<string, number> = { '1': 8, '2': 9, u: 10 }

/** Путь после заданного числа полей: в самом пути пробелы бывают. */
export const pathAfterFields = (record: string, count: number): string | null => {
  let start = 0

  for (let field = 0; field < count; field += 1) {
    start = record.indexOf(' ', start) + 1

    if (start === 0) return null
  }

  return record.slice(start)
}

/**
 * Статус обычной записи по буквам XY (X - индекс, Y - рабочая папка). Добавленный и
 * потом поправленный файл в WebStorm остаётся добавленным, как и добавленный с
 * намерением (`git add -N`, «.A»): в HEAD его нет. Удалённый где угодно - удалённый.
 * Переименованный - изменённый, скопированный - добавленный (как цвета New UI).
 */
const changeOf = (kind: string, xy: string): PathChange => {
  const [x = '.', y = '.'] = xy

  if (kind === 'u') return 'conflict'
  if (x === 'D' || y === 'D') return 'deleted'
  if (kind === '2') return x === 'C' ? 'added' : 'modified'

  return x === 'A' || y === 'A' ? 'added' : 'modified'
}

/**
 * Где проект в репозитории: prefix - его папка от корня репозитория («apps/web/» или
 * пустая строка), ignoreCase - репозиторий не различает регистр имён.
 */
export type GitScope = { prefix: string; ignoreCase: boolean }

/** Ключ пути в статусе: без регистра, если репозиторий его не различает. */
export const statusKey = (path: string, ignoreCase: boolean): string =>
  ignoreCase ? path.toLowerCase() : path

/**
 * Разбор `git status --porcelain=v2 -z` записями (разделитель - \0). Пути у git - от
 * корня репозитория, проект может быть его подпапкой: prefix (`rev-parse --show-prefix`)
 * отрезается, чужие пути выпадают. Записей больше предела - разбор останавливается, а
 * статус помечается обрезанным: игнорируемые git выдаёт последними, они и выпадут.
 */
export class GitStatusParser {
  private readonly status: GitStatus
  private readonly prefix: string
  private entries = 0
  /** Следующая запись - прежний путь переименования (`2 … путь\0прежний`). */
  private expectOrigin = false

  constructor(
    private readonly scope: GitScope,
    private readonly limit: number,
  ) {
    this.prefix = statusKey(scope.prefix, scope.ignoreCase)
    // Без прототипа: файл с именем «__proto__» или «constructor» - просто ключ.
    this.status = {
      files: Object.create(null) as GitStatus['files'],
      folders: Object.create(null) as GitStatus['folders'],
      changedFolders: Object.create(null) as GitStatus['changedFolders'],
      truncated: false,
      ignoreCase: scope.ignoreCase,
    }
  }

  /** Одна запись. false - предел достигнут, дальше читать незачем. */
  push(record: string): boolean {
    if (this.expectOrigin) {
      this.expectOrigin = false
      this.apply(record, 'deleted')

      return true
    }

    if (this.entries >= this.limit) {
      this.status.truncated = true

      return false
    }

    const kind = record.slice(0, 1)

    if (kind === '?' || kind === '!') {
      this.entries += 1
      this.apply(record.slice(2), kind === '?' ? 'untracked' : 'ignored')

      return true
    }

    const fields = FIELDS_BEFORE_PATH[kind]
    const path = fields === undefined ? null : pathAfterFields(record, fields)

    if (path === null) return true

    this.entries += 1
    this.expectOrigin = kind === '2'
    this.apply(path, changeOf(kind, record.slice(2, 4)))

    return true
  }

  /** Git не успел или его остановили на середине: у части путей статуса нет. */
  markTruncated(): void {
    this.status.truncated = true
  }

  result(): GitStatus {
    return this.status
  }

  private apply(rawPath: string, change: PathChange): void {
    const repoPath = statusKey(rawPath, this.scope.ignoreCase)

    if (!repoPath.startsWith(this.prefix)) return

    const isFolder = repoPath.endsWith('/')
    const path = toWindowPath(repoPath.slice(this.prefix.length, isFolder ? -1 : undefined))
    const { files, folders } = this.status

    if (change === 'ignored') {
      if (isFolder) folders[path] = change
      else files[path] = change

      return
    }

    if (change === 'untracked' && isFolder) folders[path] = change
    else if (change !== 'deleted') files[path] = change

    this.markAncestors(path, change === 'conflict' ? 'conflict' : 'modified')
  }

  /**
   * Папки над путём - «внутри есть изменения», вплоть до корня проекта (пустой строкой): по
   * нему видно, есть ли изменения вообще, а удалённый файл в корне иначе не оставил бы
   * следа. Папка уже помечена так же или конфликтом - значит, и все над ней: дальше не идём.
   */
  private markAncestors(path: string, change: GitFolderChange): void {
    const { changedFolders } = this.status

    for (let slash = path.lastIndexOf('/'); slash > 0; slash = path.lastIndexOf('/', slash - 1)) {
      const folder = path.slice(0, slash)
      const marked = changedFolders[folder]

      if (marked === 'conflict' || marked === change) return

      changedFolders[folder] = change
    }

    if (changedFolders[''] !== 'conflict') changedFolders[''] = change
  }
}

/**
 * Путь внутри игнорируемого: сам игнорируется или лежит в игнорируемой папке. Изменения
 * там статус не меняют - перечитывать его ради них незачем.
 */
export const isIgnoredPath = (
  { files, folders, ignoreCase }: GitStatus,
  diskPath: string,
): boolean => {
  const path = statusKey(diskPath, ignoreCase)

  if (Object.hasOwn(files, path) && files[path] === 'ignored') return true

  for (let end = path.length; end > 0; end = path.lastIndexOf('/', end - 1)) {
    const folder = path.slice(0, end)

    if (Object.hasOwn(folders, folder) && folders[folder] === 'ignored') return true
  }

  return false
}
