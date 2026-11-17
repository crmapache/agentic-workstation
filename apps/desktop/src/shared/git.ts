import type { WorkspaceState } from './workspace'

/** На чём сейчас стоит репозиторий проекта. */
export type GitHead =
  | { kind: 'branch'; name: string }
  /** HEAD не на ветке: показываем короткий хеш коммита. */
  | { kind: 'detached'; commit: string }

/** Ветки репозитория: локальные и удалённые (origin/main), по алфавиту. */
export type GitBranches = { local: string[]; remote: string[] }

export type GitBranchKind = 'local' | 'remote'

/**
 * Итог действия git. Не получилось - details: что сказал git (по-английски, как
 * есть). Это вывод внешней программы, а не текст интерфейса, поэтому без перевода.
 * summary - первая строка ответа при успехе («Already up to date.»).
 */
export type GitActionResult = { ok: true; summary: string } | { ok: false; details: string }

/** Что уйдёт при push: ветка, куда и сколько коммитов. */
export type GitPushInfo = {
  branch: string
  /** origin/main. null - у ветки нет upstream, push её опубликует. */
  upstream: string | null
  /** Куда публиковать ветку без upstream. null - удалённых репозиториев нет. */
  remote: string | null
  /** Сколько коммитов впереди upstream. null - upstream нет. */
  ahead: number | null
}

/** Состояние PR: черновик - отдельно от открытого, у GitHub это флаг, а не состояние. */
export type GitPullRequestState = 'open' | 'draft' | 'merged' | 'closed'

/** Pull request текущей ветки на GitHub: номер, адрес страницы и состояние. */
export type GitPullRequest = { number: number; url: string; state: GitPullRequestState }

/** Клонирование: получилось - новый набор проектов (клон уже открыт вкладкой). */
export type GitCloneResult = { ok: true; state: WorkspaceState } | { ok: false; details: string }

/**
 * Свой статус файла в git - цвет имени в дереве, как в WebStorm: изменён, добавлен в
 * индекс, не добавлен в git, игнорируется, конфликт слияния. Удалённых в дереве нет.
 */
export type GitPathStatus = 'modified' | 'added' | 'untracked' | 'ignored' | 'conflict'

/** Папка, внутри которой есть изменения: conflict - если среди них конфликт. */
export type GitFolderChange = 'modified' | 'conflict'

/**
 * Статусы проекта по git. Пути - от корня проекта через «/», в NFC, как в дереве. Папка
 * целиком новая или игнорируемая - одной записью в folders (корень проекта - пустой
 * строкой): статус у неё и у всего, что внутри. changedFolders - папки, внутри которых
 * есть изменения (игнорируемое не в счёт); корень проекта там же пустой строкой - есть ли
 * изменения вообще, это точка на иконке Changes. truncated - записей больше предела или
 * git не успел: у части строк цвета нет. ignoreCase - репозиторий не различает регистр
 * (core.ignorecase, обычное дело на macOS): ключи в нижнем регистре, искать - так же,
 * иначе папка, переименованная только регистром, теряла бы цвета.
 */
export type GitStatus = {
  files: Record<string, GitPathStatus>
  folders: Record<string, 'untracked' | 'ignored'>
  changedFolders: Record<string, GitFolderChange>
  truncated: boolean
  ignoreCase: boolean
}

/**
 * Что случилось с файлом по сравнению с последним коммитом (HEAD), как в списке
 * изменений WebStorm: изменён, добавлен в git, удалён, переименован (в индексе), новый и
 * не добавленный в git, конфликт слияния.
 */
export type GitChangeKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflict'

/**
 * Строка списка изменений: путь от корня проекта через «/», в NFC и с регистром как на
 * диске. origin - прежний путь переименованного файла (в HEAD он лежит там), у остальных
 * null. modeChanged - поменялись права файла (`chmod +x`): в строках этого не видно.
 */
export type GitChange = {
  path: string
  kind: GitChangeKind
  origin: string | null
  modeChanged?: boolean
}

/**
 * Изменённые файлы проекта в порядке git: сначала то, что git знает, потом новые файлы,
 * каждый отдельно, и внутри новых папок. truncated - записей больше предела: список не
 * весь. notGit - папка не в git (или в ней всё игнорируется, или git не установлен);
 * failed - репозиторий есть, но git не ответил (отказ, сбой, не успел).
 */
export type GitChanges = GitChangeList | { kind: 'notGit' } | { kind: 'failed' }

/** Прочитанный список изменений (GitChanges): файлы и обрезан ли он пределом. */
export type GitChangeList = { kind: 'listed'; files: GitChange[]; truncated: boolean }

/**
 * Сколько строк проекта добавлено и удалено по сравнению с последним коммитом, вместе с новыми
 * файлами, - счёт в шапке рядом с веткой. Двоичные и огромные файлы строк не дают, но в files
 * идут: изменения есть, даже если строк ноль. partial - посчитано не всё: список изменений
 * обрезан пределом или git не успел, цифры - нижняя граница.
 */
export type GitLineStats = { added: number; deleted: number; files: number; partial: boolean }

/**
 * Файл, каким он лежит в последнем коммите, - левая сторона разницы. bom - была ли метка
 * порядка байтов (её снимают с текста, как у файла на диске). missing - в HEAD его нет
 * (новый файл или коммитов ещё нет). Не текст и слишком большой - словами, как в
 * редакторе; size null - фильтр git развернул файл за предел, и сколько вышло, неизвестно.
 */
export type GitHeadFile =
  | { kind: 'text'; text: string; bom: boolean }
  | { kind: 'missing' }
  | { kind: 'binary' }
  | { kind: 'tooLarge'; size: number | null; limit: number }
  | { kind: 'failed' }
