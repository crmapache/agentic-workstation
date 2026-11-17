import type { GitStatus, GitChanges, GitLineStats, GitChangeList } from '@shared/git'

import { CoalescedRun } from './coalesced-run'
import { FileLineCounter } from './file-line-counter'
import { readGitLineStats } from './git-line-stats'
import { readGitScope, readGitStatus, readGitChanges } from './git-status'
import { isIgnoredPath } from './git-status-output'
import type { GitScope } from './git-status-output'

/**
 * Как читать: где проект в репозитории, статус для дерева, список изменений и счёт строк по
 * этому списку. Подменяется в тестах.
 */
export type GitStatusReader = {
  scope: (rootPath: string) => Promise<GitScope | null>
  status: (rootPath: string, scope: GitScope) => Promise<GitStatus | null>
  changes: (rootPath: string, scope: GitScope) => Promise<GitChanges>
  lines: (
    rootPath: string,
    changes: GitChangeList,
    counter: FileLineCounter,
  ) => Promise<GitLineStats | null>
}

/** Кому сообщать, что статус, список изменений или счёт строк проекта стал другим. */
export type GitStatusListeners = {
  status: (projectId: string, status: GitStatus | null) => void
  changes: (projectId: string, changes: GitChanges) => void
  lines: (projectId: string, stats: GitLineStats | null) => void
}

/** Что поменялось: в .git и где в файлах проекта (null - неизвестно где). */
export type GitStatusTrigger = { git: boolean; paths: string[] | null }

/** Последнее прочитанное и последнее разосланное строкой: то же самое второй раз окну не шлём. */
type Mirror<T> = { last: T | null; sent: string | null }

/** Зеркало того, что читается, только когда окно спросило. */
type WantedMirror<T> = Mirror<T> & { wanted: boolean }

type Tracked = {
  runner: CoalescedRun<void>
  rootPath: string
  /** Где проект в репозитории; undefined - ещё не узнавали или пора узнать заново. */
  scope: GitScope | null | undefined
  status: Mirror<GitStatus | null>
  /** Список изменений читается, только когда окно его спросило: это второй git status. */
  changes: WantedMirror<GitChanges>
  /** Счёт строк - тоже по вопросу окна: это ещё git diff и чтение новых файлов. */
  lines: WantedMirror<GitLineStats | null>
  /** Строки новых файлов прошлого счёта: неизменённые не перечитываются. */
  lineCounter: FileLineCounter
}

const READER: GitStatusReader = {
  scope: readGitScope,
  status: readGitStatus,
  changes: readGitChanges,
  lines: readGitLineStats,
}

/**
 * Статусы git открытых проектов, их списки изменений и счёт строк. Владелец - главный
 * процесс: перечитывает их, когда на диске или в .git что-то поменялось, и сам сообщает
 * окну, если они стали другими. Чтения одного проекта идут по одному: пачка изменений во
 * время чтения даёт одно следующее, а не очередь из git status.
 */
export class GitStatusService {
  private readonly projects = new Map<string, Tracked>()

  constructor(
    private readonly listeners: GitStatusListeners,
    private readonly reader: GitStatusReader = READER,
  ) {}

  /**
   * Свежий статус для окна - с проверкой, в репозитории ли проект: окно спрашивает при
   * открытии и при возврате, а git init выше папки проекта слежение не видит. С этого
   * вопроса проект и начинает перечитываться сам.
   */
  async get(projectId: string, rootPath: string): Promise<GitStatus | null> {
    const tracked = this.track(projectId, rootPath)

    tracked.scope = undefined
    await tracked.runner.run()

    return tracked.status.last
  }

  /**
   * Свежий список изменений (вид Changes). С этого вопроса список перечитывается вместе
   * со статусом при каждом изменении, пока проект открыт.
   */
  async getChanges(projectId: string, rootPath: string): Promise<GitChanges> {
    const tracked = this.track(projectId, rootPath)

    tracked.scope = undefined
    tracked.changes.wanted = true
    await tracked.runner.run()

    return tracked.changes.last ?? { kind: 'failed' }
  }

  /**
   * Свежий счёт строк (шапка окна). С этого вопроса счёт идёт вместе со статусом при каждом
   * изменении, пока проект открыт. null - не git или git не ответил.
   */
  async getLineStats(projectId: string, rootPath: string): Promise<GitLineStats | null> {
    const tracked = this.track(projectId, rootPath)

    tracked.scope = undefined
    tracked.lines.wanted = true
    await tracked.runner.run()

    return tracked.lines.last
  }

  /**
   * На диске проекта что-то поменялось. Не перечитываем проект, о котором окно не
   * спрашивало, и изменения только внутри игнорируемого (логи, сборки): ни статус, ни
   * список изменений от них не меняются, а пишут туда без перерыва.
   */
  changed(projectId: string, { git, paths }: GitStatusTrigger): void {
    const tracked = this.projects.get(projectId)

    if (!tracked) return

    const { last } = tracked.status

    if (git) tracked.scope = undefined
    else if (paths && last && paths.every((path) => isIgnoredPath(last, path))) return

    tracked.runner
      .run()
      .catch((error: unknown) => console.warn('[git] статус не перечитался:', error))
  }

  /** Проект закрыли: больше не читать и не рассылать. */
  forget(projectId: string): void {
    this.projects.delete(projectId)
  }

  private track(projectId: string, rootPath: string): Tracked {
    const existing = this.projects.get(projectId)

    if (existing?.rootPath === rootPath) return existing

    const tracked: Tracked = {
      rootPath,
      scope: undefined,
      status: { last: null, sent: null },
      changes: { last: null, sent: null, wanted: false },
      lines: { last: null, sent: null, wanted: false },
      lineCounter: new FileLineCounter(),
      runner: new CoalescedRun(() => this.read(projectId, tracked)),
    }

    this.projects.set(projectId, tracked)

    return tracked
  }

  private async read(projectId: string, tracked: Tracked): Promise<void> {
    const { rootPath } = tracked

    if (tracked.scope === undefined) tracked.scope = await this.reader.scope(rootPath)

    const { scope } = tracked
    const status = scope === null ? null : await this.reader.status(rootPath, scope)

    this.publish(projectId, tracked, tracked.status, status, this.listeners.status)

    // Счёт строк берёт число файлов и новые файлы из списка изменений - список читается и
    // для него, а окну уходит, только если окно его спрашивало.
    if (!tracked.changes.wanted && !tracked.lines.wanted) return

    const changes: GitChanges =
      scope === null ? { kind: 'notGit' } : await this.reader.changes(rootPath, scope)

    if (tracked.changes.wanted) {
      this.publish(projectId, tracked, tracked.changes, changes, this.listeners.changes)
    }

    if (!tracked.lines.wanted) return

    const lines =
      changes.kind === 'listed'
        ? await this.reader.lines(rootPath, changes, tracked.lineCounter)
        : null

    this.publish(projectId, tracked, tracked.lines, lines, this.listeners.lines)
  }

  /** Запомнить прочитанное и разослать, если оно другое. Проект успели закрыть - окну он не нужен. */
  private publish<T>(
    projectId: string,
    tracked: Tracked,
    mirror: Mirror<T>,
    value: T,
    send: (projectId: string, value: T) => void,
  ): void {
    const serialized = JSON.stringify(value)

    mirror.last = value

    if (this.projects.get(projectId) === tracked && serialized !== mirror.sent) {
      mirror.sent = serialized
      send(projectId, value)
    }
  }
}
