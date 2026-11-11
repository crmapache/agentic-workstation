import { stat, rename, realpath } from 'node:fs/promises'
import { join, relative, isAbsolute } from 'node:path'

import type { FeedPatch } from '@shared/claude-feed'
import type { FileOpOutcome } from '@shared/file-ops'
import type {
  HistoryList,
  HistoryCause,
  HistoryContent,
  HistoryRestoreOutcome,
} from '@shared/local-history'
import type { ProjectFileList } from '@shared/search'

import { placeOf } from '../fs/file-ops'
import { toWindowPath } from '../fs/project-paths'
import { decodeText, relativeInside } from '../fs/text-file.utils'
import { writeProjectBytes } from '../fs/text-write'
import type { EditEntry } from '../claude/changes/turn-edits'
import { isContentKey } from './content-key'
import { HistoryBlobs } from './history-blobs'
import { openHistoryDb } from './history-db'
import { agentEditsOf, HistoryIntents } from './history-intents'
import { HistoryStore } from './history-store'
import {
  INTENT_MS,
  LIST_LIMIT,
  RETENTION_MS,
  KEEP_GRACE_MS,
  RETENTION_DAYS,
  HISTORY_DB_NAME,
  HISTORY_DIR_NAME,
  PURGE_INTERVAL_MS,
  FIRST_SCAN_DELAY_MS,
} from './history.constants'
import { RootHistory } from './root-history'

export type LocalHistoryDeps = {
  dataDir: string
  /** Файлы проекта без игнорируемых - тот же список, что у поиска по имени. */
  listFiles: (root: string) => Promise<ProjectFileList>
  /** В истории проекта появились события у этих путей. */
  onChange: (root: string, paths: string[]) => void
  now?: () => number
  /** Через сколько после открытия проекта его полная сверка (тесты - сразу). */
  firstScanDelayMs?: number
}

const EMPTY: HistoryList = {
  scope: 'file',
  entries: [],
  truncated: false,
  retentionDays: RETENTION_DAYS,
}

/** Сколько вызовов агента помнить, чтобы снимок «до правки» брался один раз на вызов. */
const AGENT_CALLS_KEPT = 1_000

/**
 * База истории. Не открылась - отложить испорченную в сторону и начать новую: история - не
 * то, из-за чего IDE должна не запускаться. Совсем никак - история выключена (null).
 */
const openStore = async (dataDir: string): Promise<HistoryStore | null> => {
  const path = join(dataDir, HISTORY_DIR_NAME, HISTORY_DB_NAME)

  try {
    return new HistoryStore(openHistoryDb(path))
  } catch (error) {
    console.warn('[history] база не открылась, начинаю новую:', error)
  }

  try {
    await rename(path, `${path}.broken-${Date.now()}`).catch(() => undefined)

    return new HistoryStore(openHistoryDb(path))
  } catch (error) {
    console.warn('[history] локальная история выключена:', error)

    return null
  }
}

/**
 * Локальная история файлов (ADR 0045), как Local History в WebStorm: каждое изменение файла
 * открытого проекта - из редактора, извне, агентом - хранится месяц, любую версию можно
 * посмотреть и вернуть. Источники событий: слежение за диском, запись IDE (объявляет себя
 * заранее), лента агента (его инструменты правки), переносы из дерева.
 */
export class LocalHistory {
  private readonly roots = new Map<string, RootHistory>()
  private readonly intents = new HistoryIntents()
  private readonly agentCalls = new Set<string>()
  private readonly now: () => number
  private readonly blobs: HistoryBlobs | null
  private purgeTimer: NodeJS.Timeout | null = null

  private constructor(
    private readonly store: HistoryStore | null,
    private readonly deps: LocalHistoryDeps,
  ) {
    this.now = deps.now ?? Date.now
    this.blobs = store && new HistoryBlobs(store, this.now)
  }

  static async open(deps: LocalHistoryDeps): Promise<LocalHistory> {
    const history = new LocalHistory(await openStore(deps.dataDir), deps)

    history.purge()
    history.purgeTimer = setInterval(() => history.purge(), PURGE_INTERVAL_MS)

    return history
  }

  /** Открытые проекты поменялись: новые - сверяются с диском, закрытые - отпускаются. */
  projectsChanged(rootPaths: readonly string[]): void {
    const open = new Set(rootPaths)

    for (const [root, history] of this.roots) {
      if (open.has(root)) continue

      this.roots.delete(root)
      void history.close()
    }

    // Полная сверка - только у только что открытых: смена активного проекта - тоже смена
    // состояния проектов, но сверять заново нечего.
    for (const root of open) {
      if (!this.roots.has(root)) {
        this.openRoot(root)?.requestScan(this.deps.firstScanDelayMs ?? FIRST_SCAN_DELAY_MS)
      }
    }
  }

  /** Событие слежения: пути (от корня) или null - событий слишком много, сверить всё. */
  diskChanged(root: string, paths: readonly string[] | null): void {
    const history = this.rootOf(root)

    if (!history) return
    if (paths === null) return history.requestScan()

    void history.sync(paths).then((done) => done || history.requestScan())
  }

  /**
   * IDE сейчас запишет файл: его изменение - с этой причиной, а не «извне». Ответ - путь
   * настоящего файла (запись по ссылке ложится в её цель) или null, если он за проектом.
   */
  async beforeWrite(root: string, path: string, cause: HistoryCause): Promise<string | null> {
    const real = await this.realPath(root, path)

    if (real !== null) this.expect(root, real, cause)

    return real
  }

  /** Объявить причину будущего изменения пути (путь - уже настоящий, не ссылка). */
  expect(root: string, path: string, cause: HistoryCause): void {
    this.intents.note(root, path, cause, this.now() + INTENT_MS)
  }

  /**
   * Сверить файлы сейчас - после записи IDE, не дожидаясь слежения. Причина записи
   * передаётся прямо: объявление могло истечь, пока очередь проекта была занята.
   */
  async settle(root: string, paths: readonly string[], cause?: HistoryCause): Promise<void> {
    const valid = paths.filter((path) => placeOf(root, path) !== null)
    const causes = new Map(cause ? valid.map((path) => [path, cause] as const) : [])

    if (valid.length > 0) await this.rootOf(root)?.sync(valid, { causes })
  }

  /**
   * Файл открыли в редакторе: история запоминает его как есть, даже игнорируемый git (.env),
   * - чтобы у первой же правки было «до». Открытый по ссылке - его цель.
   */
  opened(root: string, path: string): void {
    void this.realPath(root, path).then((real) => {
      if (real !== null) return this.rootOf(root)?.sync([real], { snapshot: true })
    })
  }

  /** Перенос из дерева: rename - в очереди проекта, история едет за файлами. */
  move(root: string, from: string, rename: () => Promise<FileOpOutcome>): Promise<FileOpOutcome> {
    return this.rootOf(root)?.move(from, rename) ?? rename()
  }

  /**
   * Заплатка ленты агента: его инструменты правки. Изменение во время и сразу после вызова -
   * правка агента (объявлено сразу, ещё до снимка); перед правкой файл запоминается как есть
   * (первый раз на вызов). Снимок может опоздать - CLI пишет быстро; тогда «до» даст точная
   * правка из результата (agentEdited).
   */
  agentFeed(patch: FeedPatch): void {
    for (const edit of agentEditsOf(patch, this.now())) {
      const place = this.placeOfAbsolute(edit.path)

      if (!place) continue

      const { history, path } = place

      this.intents.note(history.path, path, 'agent', edit.until)

      if (!edit.running || this.agentCalls.has(edit.id)) continue
      if (this.agentCalls.size >= AGENT_CALLS_KEPT) this.agentCalls.clear()

      this.agentCalls.add(edit.id)
      void history.sync([path], { snapshot: true })
    }
  }

  /** Точная правка агента из результата CLI (структурный дифф): «до», если снимок опоздал. */
  agentEdited({ path: absolute, edit }: EditEntry): void {
    // Созданный файл «до» не имеет, правка без диффа - снять нечего.
    if (typeof edit !== 'object' || edit.kind !== 'patch') return

    const place = this.placeOfAbsolute(absolute)

    if (place) void place.history.recoverAgentEdit(place.path, edit.hunks)
  }

  /**
   * История файла или всего в папке ('' - проект): новые сверху. Папка ли это - по диску, а
   * у пропавшего - по событиям: у папки они у файлов внутри.
   */
  async list(root: string, path: string): Promise<HistoryList> {
    const history = this.rootOf(root)
    const absolute = placeOf(root, path, true)

    if (!history || !this.store || absolute === null) return EMPTY

    const rows = this.store.list(history.id, path, LIST_LIMIT + 1)
    const isFolder =
      path === '' ||
      (await stat(absolute).then(
        (info) => info.isDirectory(),
        () => false,
      )) ||
      rows.some((row) => row.path !== path)

    return {
      scope: isFolder ? 'folder' : 'file',
      // Начало серии сохранений - дело базы, окну хватает времени события.
      entries: rows.slice(0, LIST_LIMIT).map(({ startedAt: _startedAt, ...entry }) => entry),
      truncated: rows.length > LIST_LIMIT,
      retentionDays: RETENTION_DAYS,
    }
  }

  /** Содержимое версии - только из истории этого проекта. */
  async content(root: string, key: string): Promise<HistoryContent> {
    const bytes = await this.read(root, key)

    if (!bytes) return { kind: 'lost' }

    const decoded = decodeText(bytes)

    return decoded ? { kind: 'text', text: decoded.text } : { kind: 'binary', size: bytes.length }
  }

  /**
   * Вернуть файлу версию: в очереди проекта сначала запомнить то, что на диске (и не
   * пойманную ещё правку, и файл больше предела), потом записать версию поверх (удалённый
   * появится снова) - событие «возвращена версия». Прежнее остаётся в истории.
   */
  async restore(root: string, path: string, key: string): Promise<HistoryRestoreOutcome> {
    const history = this.rootOf(root)

    if (!history || placeOf(root, path) === null) return { ok: false, code: 'failed' }

    const bytes = await this.read(root, key)

    if (!bytes) return { ok: false, code: 'lost' }

    // Причину «возвращена» сверка после записи получает прямо: объявленная заранее, она
    // подписала бы и правку извне, которую сверка перед записью ещё ловит.
    const written = await history.restore(path, () => writeProjectBytes(root, path, bytes))

    if (written === 'saved') return { ok: true }

    return {
      ok: false,
      code:
        written === 'occupied' || written === 'denied' || written === 'tooLarge'
          ? written
          : 'failed',
    }
  }

  /** Дождаться сверок проекта: полной, если она запрошена, и всего в очереди. */
  async idle(root: string): Promise<void> {
    await this.rootOf(root)?.idle()
  }

  /** Выход из IDE: идущие сверки дожидаются, база закрывается. */
  async close(): Promise<void> {
    if (this.purgeTimer) clearInterval(this.purgeTimer)

    await Promise.all([...this.roots.values()].map((history) => history.close()))
    this.roots.clear()
    this.store?.close()
  }

  private rootOf(root: string): RootHistory | null {
    return this.roots.get(root) ?? null
  }

  private openRoot(root: string): RootHistory | null {
    if (!this.store || !this.blobs) return null

    const { id, scanned } = this.store.root(root, this.now())
    const history = new RootHistory(root, id, scanned, {
      store: this.store,
      blobs: this.blobs,
      listFiles: this.deps.listFiles,
      causeOf: (at, path) => this.intents.causeOf(at, path, this.now()),
      now: this.now,
      changed: this.deps.onChange,
    })

    this.roots.set(root, history)

    return history
  }

  /**
   * Путь настоящего файла от корня: ссылка внутри проекта - её цель, ссылка за проект - null.
   * Файла ещё нет - путь как есть.
   */
  private async realPath(root: string, path: string): Promise<string | null> {
    const absolute = placeOf(root, path)

    if (absolute === null) return null

    try {
      const real = relativeInside(await realpath(root), await realpath(absolute))

      return real === null ? null : toWindowPath(real)
    } catch {
      return path
    }
  }

  /** Абсолютный путь агента - в проект и путь от его корня; не в открытом проекте - null. */
  private placeOfAbsolute(absolute: string): { history: RootHistory; path: string } | null {
    for (const history of this.roots.values()) {
      const path = toWindowPath(relative(history.path, absolute))

      if (path && !path.startsWith('..') && !isAbsolute(path) && placeOf(history.path, path)) {
        return { history, path }
      }
    }

    return null
  }

  private async read(root: string, key: string): Promise<Buffer | null> {
    const history = this.rootOf(root)

    if (!history || !this.store || !this.blobs || !isContentKey(key)) return null
    if (!this.store.refers(history.id, key)) return null

    return this.blobs.read(root, key)
  }

  /** Месячная уборка: открытые проекты живы, остальное старше срока уходит. */
  private purge(): void {
    if (!this.store) return

    try {
      this.store.touchRoots(
        [...this.roots.values()].map((history) => history.id),
        this.now(),
      )
      this.store.purge(this.now() - RETENTION_MS, this.now() - KEEP_GRACE_MS)
    } catch (error) {
      console.warn('[history] уборка не прошла:', error)
    }

    // Открытая история перечитывается: ушедшее за срок из неё пропадает.
    for (const history of this.roots.values()) this.deps.onChange(history.path, [])
  }
}
