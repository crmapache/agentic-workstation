import type { QueueItem, ScenarioQueue, ScenarioQueuesView } from '@shared/scenario-queues'
import { carryOnItemOf } from '@shared/scenario-queues'

import { QUEUE_NAMES } from './queue-folder.constants'

/**
 * Папка проекта и очереди без worktree на экране (ADR 0128): кто её держит, кто ждёт и чего ждёт
 * эта очередь. Само правило - у главного процесса: окно читает его итог из снимка очередей
 * (`folders`), чтобы показывать ровно то, по чему очереди и стартуют. Общее для вида сценариев и
 * трекера: оба открывают очереди.
 */

type FoldersView = Pick<ScenarioQueuesView, 'queues' | 'folders'> | undefined

/** Очередь, что держит папку, и её недоделанный, если она на нём стоит. */
export type FolderHolder = { queue: ScenarioQueue; unfinished: QueueItem | null }

/** Чего ждёт очередь: держатели папки и очереди впереди неё в ожидании. */
export type FolderWait = { holders: FolderHolder[]; ahead: ScenarioQueue[] }

const queuesOf = (view: FoldersView, ids: readonly string[]): ScenarioQueue[] =>
  ids.flatMap((id) => view?.queues.find((queue) => queue.id === id) ?? [])

const holdersOf = (view: FoldersView, ids: readonly string[]): FolderHolder[] =>
  queuesOf(view, ids).map((queue) => ({ queue, unfinished: carryOnItemOf(queue) }))

/** Ждёт ли очередь папку проекта и чего; null - не ждёт. */
export const folderWaitOf = (view: FoldersView, queue: ScenarioQueue): FolderWait | null => {
  const folder = view?.folders.find((one) => one.projectPath === queue.projectPath)
  const place = folder?.line.indexOf(queue.id) ?? -1

  if (!folder || place < 0) return null

  return {
    holders: holdersOf(view, folder.holders),
    ahead: queuesOf(view, folder.line.slice(0, place)),
  }
}

/**
 * Кого будет ждать новая очередь без worktree в папке проекта: держатели, а нет их (папку вот-вот
 * возьмёт первая в ожидании) - очереди в ожидании. Пусто - папка свободна, очередь начнёт сразу.
 */
export const folderTakers = (view: FoldersView, projectPath: string): ScenarioQueue[] => {
  const folder = view?.folders.find((one) => one.projectPath === projectPath)

  if (!folder) return []

  return queuesOf(view, folder.holders.length > 0 ? folder.holders : folder.line)
}

/** Имена очередей одной строкой - для слов о папке: «Deploy and Fix». */
export const queueNames = (queues: readonly ScenarioQueue[]): string =>
  QUEUE_NAMES.format(queues.map((queue) => queue.name))
