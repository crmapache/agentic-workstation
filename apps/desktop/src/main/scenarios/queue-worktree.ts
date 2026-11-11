import type { QueueWorkdir, ScenarioQueue, WorktreeFacts } from '@shared/scenario-queues'
import type { ScenarioCode } from '@shared/scenarios'

import {
  removeIfEmpty,
  WorktreeError,
  worktreeState,
  createWorktree,
  removeWorktree,
} from '../git/git-worktree'
import type { QueueBook } from './queues/queue-book'

/** Коды git - словами окна: человек должен понять, почему worktree не создался. */
const CODES: Record<WorktreeError['code'], ScenarioCode> = {
  'not-a-repo': 'notARepo',
  'no-commits': 'noCommits',
  dirty: 'worktreeDirty',
  missing: 'worktreeFailed',
  failed: 'worktreeFailed',
}

const codeOf = (error: unknown): ScenarioCode =>
  error instanceof WorktreeError ? CODES[error.code] : 'worktreeFailed'

/** Имя папки и git-ветки: из имени сценария, латиница, плюс кусок id очереди - не совпадёт. */
export const slugOf = (scenarioName: string, queueId: string): string => {
  const words = scenarioName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')

  return `${words || 'queue'}-${queueId.slice(0, 4).toLowerCase()}`
}

type Host = {
  book: QueueBook
  onQueues: () => void
  worktreesRoot: string
  /** Очереди, чей worktree сейчас удаляется: шаг и постановка их обходят. */
  removing: Set<string>
}

/**
 * Пометить worktree удалённым поверх свежей очереди: git удаляет минутами, и за это время у
 * очереди могли поменяться имя или элементы - старый снимок их бы стёр.
 */
const markRemoved = (queueId: string, host: Host) => {
  const latest = host.book.get(queueId)

  if (latest?.workdir.kind !== 'worktree') return

  host.book.put({ ...latest, workdir: { ...latest.workdir, removed: true } })
  host.onQueues()
}

/** Удаление под отметкой «идёт»: пока git работает, в папке ничего не начинается. */
const whileRemoving = async <T>(
  queueId: string,
  host: Host,
  work: () => Promise<T>,
): Promise<T> => {
  host.removing.add(queueId)

  try {
    return await work()
  } finally {
    host.removing.delete(queueId)
  }
}

/**
 * Worktree очереди: создаётся при создании очереди (галочка в окне запуска), живёт, пока
 * человек его не удалит, и сам уходит только при закрытии очереди, если она ничего в нём
 * не оставила - ни коммитов, ни правок.
 */
export const queueWorktree = {
  async create(
    projectPath: string,
    scenarioName: string,
    queueId: string,
    root: string,
  ): Promise<QueueWorkdir | { code: ScenarioCode; detail?: string }> {
    try {
      const made = await createWorktree({ projectPath, slug: slugOf(scenarioName, queueId), root })

      return {
        kind: 'worktree',
        path: made.path,
        projectDir: made.projectDir,
        gitBranch: made.gitBranch,
        baseCommit: made.baseCommit,
        removed: false,
      }
    } catch (error) {
      console.warn('[scenarios] worktree не создался:', error)

      return { code: codeOf(error), detail: error instanceof Error ? error.message : '' }
    }
  },

  facts(queue: ScenarioQueue): Promise<WorktreeFacts> {
    const { workdir } = queue

    if (workdir.kind !== 'worktree' || workdir.removed) {
      return Promise.resolve({ exists: false, dirty: false, commitsAhead: 0 })
    }

    return worktreeState(workdir.path, workdir.baseCommit)
  },

  /**
   * Удалить по просьбе человека. Есть несохранённое - только с force (окно спросило);
   * git-ветка остаётся, если в ней есть свои коммиты, которые никуда не слиты.
   */
  async remove(queue: ScenarioQueue, force: boolean, host: Host): Promise<ScenarioCode | null> {
    const { workdir } = queue

    if (workdir.kind !== 'worktree' || workdir.removed) return null

    try {
      await whileRemoving(queue.id, host, () =>
        removeWorktree({
          projectPath: queue.projectPath,
          path: workdir.path,
          gitBranch: workdir.gitBranch,
          force,
          deleteBranch: 'if-merged',
          root: host.worktreesRoot,
        }),
      )
    } catch (error) {
      return codeOf(error)
    }

    markRemoved(queue.id, host)

    return null
  },

  /** Очередь закрыли: пустой worktree уходит сам, с работой - остаётся человеку. */
  async dropIfEmpty(queue: ScenarioQueue, host: Host): Promise<void> {
    const { workdir } = queue

    if (workdir.kind !== 'worktree' || workdir.removed) return

    const gone = await whileRemoving(queue.id, host, () =>
      removeIfEmpty({
        projectPath: queue.projectPath,
        path: workdir.path,
        gitBranch: workdir.gitBranch,
        baseCommit: workdir.baseCommit,
        root: host.worktreesRoot,
      }),
    ).catch((error: unknown) => {
      console.warn('[scenarios] пустой worktree не удалился:', error)

      return false
    })

    if (gone) markRemoved(queue.id, host)
  },
}
