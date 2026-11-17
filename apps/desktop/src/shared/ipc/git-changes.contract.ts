import type { GitChanges, GitHeadFile, GitLineStats } from '../git'

type ProjectRequest = { projectId: string }

/**
 * Часть контракта (contract.ts) про список изменений git и разницу файла: что
 * поменялось по сравнению с последним коммитом, сколько в нём строк и каким файл был в нём. Отдельным файлом
 * по области, правила те же (.claude/rules/ipc-contract.md).
 */
export type GitChangesInvokeContract = {
  /**
   * Изменённые файлы проекта - свежие, или почему их нет (не git, git не ответил). С этого
   * вопроса главный процесс перечитывает список сам и присылает событием git:changes.
   */
  'git:getChanges': { request: ProjectRequest; response: GitChanges }
  /**
   * Сколько строк добавлено и удалено с последнего коммита - счёт в шапке. null - папка не в
   * git или git не ответил. С этого вопроса главный процесс пересчитывает сам и присылает
   * событием git:lineStats.
   */
  'git:getLineStats': { request: ProjectRequest; response: GitLineStats | null }
  /** Файл, каким он лежит в последнем коммите (путь от корня проекта), - левая сторона разницы. */
  'git:readHeadFile': { request: ProjectRequest & { path: string }; response: GitHeadFile }
}

export type GitChangesEventContract = {
  /** Список изменений проекта стал другим - после изменений на диске или в .git. */
  'git:changes': { projectId: string; changes: GitChanges }
  /** Счёт строк проекта стал другим - после изменений на диске или в .git. */
  'git:lineStats': { projectId: string; stats: GitLineStats | null }
}

/** Каналы этой части в рантайме: их разворачивает INVOKE_CHANNELS. */
export const GIT_CHANGES_CHANNELS = {
  'git:getChanges': true,
  'git:getLineStats': true,
  'git:readHeadFile': true,
} satisfies Record<keyof GitChangesInvokeContract, true>

/** События этой части: их разворачивает EVENT_CHANNELS. */
export const GIT_CHANGES_EVENTS = {
  'git:changes': true,
  'git:lineStats': true,
} satisfies Record<keyof GitChangesEventContract, true>
