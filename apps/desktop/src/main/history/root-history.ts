import { lstat, readFile } from 'node:fs/promises'

import type { FileOpOutcome } from '@shared/file-ops'
import type { HistoryCause } from '@shared/local-history'
import type { ProjectFileList } from '@shared/search'

import { resolveInsideRoot } from '../fs/project-paths'
import { decodeText, encodeText, isTextStart } from '../fs/text-file.utils'
import { isGitScope } from '../search/git-scope'
import { undoEdits } from '../claude/changes/change-revert'
import type { EditHunk } from '../claude/changes/change-revert'
import { contentKey } from './content-key'
import type { HistoryBlobs } from './history-blobs'
import { ignoredPaths } from './history-ignore'
import { NameCheck, filesInFolder } from './history-observe'
import { planSync } from './history-plan'
import type { FileRow, HistoryStore } from './history-store'
import type { SyncDeps } from './history-sync'
import { lookAt, causesOf, recordPlan } from './history-sync'
import {
  RESCAN_GAP_MS,
  BASELINE_COPY_BUDGET,
  NEW_FOLDER_MAX_FILES,
  HISTORY_FILE_MAX_BYTES,
  RESTORE_KEEP_MAX_BYTES,
} from './history.constants'

export type RootHost = {
  store: HistoryStore
  blobs: HistoryBlobs
  /** Список файлов проекта без игнорируемых - тот же, что у поиска по имени. */
  listFiles: (root: string) => Promise<ProjectFileList>
  causeOf: (root: string, path: string) => HistoryCause | null
  now: () => number
  /** В истории проекта появились события у этих путей. */
  changed: (root: string, paths: string[]) => void
}

/**
 * Как сверять пути: snapshot - снимок «до» (файл открыли, агент вот-вот поправит):
 * незнакомое только запомнить; causes - чьей правкой считать изменения.
 */
type SyncOptions = { snapshot?: boolean; causes?: ReadonlyMap<string, HistoryCause> }

const NO_CAUSES: ReadonlyMap<string, HistoryCause> = new Map()

/** Сколько байт с начала смотреть, текст ли это: как у git и редактора. */
const TEXT_SNIFF_BYTES = 8_000

/**
 * История одного проекта: сверка того, что она помнит, с диском. Всё по очереди - вторая
 * сверка начинается от записанного первой, а перенос из дерева и возврат версии не
 * пересекаются со сверками о том же.
 */
export class RootHistory {
  private chain: Promise<unknown> = Promise.resolve()
  private inGit: Promise<boolean> | null = null
  private closed = false
  private scanTimer: NodeJS.Timeout | null = null
  private scanDone: Promise<void> = Promise.resolve()
  private scanSettled: () => void = () => undefined
  private scanning = false
  private scanAgain = false
  private lastScanAt = -Infinity
  private readonly deps: SyncDeps

  constructor(
    readonly path: string,
    readonly id: number,
    private scanned: boolean,
    private readonly host: RootHost,
  ) {
    this.deps = { root: path, id, store: host.store, blobs: host.blobs, now: host.now }
  }

  /**
   * Попросить полную сверку - не раньше delay и не чаще паузы между сверками: pnpm install
   * переполняет слежение каждую секунду. Просьба посреди сверки - ещё одна после неё.
   */
  requestScan(delay = 0): void {
    if (this.closed) return
    if (this.scanning) {
      this.scanAgain = true

      return
    }
    if (this.scanTimer) return

    const wait = Math.max(delay, this.lastScanAt + RESCAN_GAP_MS - this.host.now())

    this.scanDone = new Promise((resolve) => {
      this.scanSettled = resolve
      this.scanTimer = setTimeout(() => void this.runScan().then(resolve), wait)
    })
  }

  /** Дождаться запрошенной полной сверки и всего, что уже стоит в очереди. */
  async idle(): Promise<void> {
    await this.scanDone
    await this.queued(() => undefined, undefined)
  }

  /**
   * Полная сверка проекта: при открытии и когда событий слишком много (смена ветки). Имена
   * из списка файлов сверяются с диском: индекс git помнит прежний регистр. Первая сверка
   * копирует к себе только текст и в пределах бюджета; правки - всегда.
   */
  scanAll(): Promise<void> {
    return this.queued(async () => {
      const { paths: listed } = await this.host.listFiles(this.path)
      const names = new NameCheck(this.path)
      const real = await Promise.all(listed.map((path) => names.onDisk(path)))
      const known = this.host.store.files(this.id)
      const candidates = [...new Set([...real, ...known.keys()])]
      const baseline = !this.scanned
      // Бюджет - на то, что история правда кладёт к себе: закоммиченное хранит git.
      const budget = baseline ? { left: BASELINE_COPY_BUDGET } : null
      const copy = (path: string, bytes: Buffer) =>
        !baseline || known.has(path) || isTextStart(bytes.subarray(0, TEXT_SNIFF_BYTES))

      const observed = await lookAt(this.deps, candidates, known, () => names, copy, budget)

      if (this.closed) return

      const plan = planSync({ known, observed, baseline, causeOf: this.cause })

      this.report(await recordPlan(this.deps, plan))
      this.host.store.markScanned(this.id)
      this.scanned = true
    }, undefined)
  }

  /**
   * Сверить пути: события слежения, запись IDE (causes - её причина), снимок «до» (файл
   * открыли в редакторе, агент вот-вот его поправит). Ответ false - новая папка
   * слишком большая, нужна полная сверка проекта.
   */
  sync(paths: readonly string[], options: SyncOptions = {}): Promise<boolean> {
    return this.queued(() => this.syncNow(paths, options), true)
  }

  /**
   * Перенос из дерева - в очереди проекта: сверка не увидит его наполовину (старого места
   * нет, нового ещё нет в её списке). История едет за файлами, у каждого - событие.
   */
  move(from: string, rename: () => Promise<FileOpOutcome>): Promise<FileOpOutcome> {
    if (this.closed) return rename()

    return this.exclusive(async () => {
      const outcome = await rename()

      if (outcome.ok && !this.closed) {
        try {
          this.recordMove(from, outcome.path)
        } catch (error) {
          console.warn('[history] перенос не записался:', error)
        }
      }

      return outcome
    })
  }

  /**
   * Возврат версии - в очереди проекта, одной работой: сначала непойманная правка становится
   * событием, файл больше предела копируется к себе (иначе он пропал бы навсегда), потом
   * запись и событие «возвращена версия». Ответ - итог записи, tooLarge или failed.
   */
  restore<T extends string>(
    path: string,
    write: () => Promise<T>,
  ): Promise<T | 'tooLarge' | 'failed'> {
    return this.queued(async (): Promise<T | 'tooLarge' | 'failed'> => {
      await this.syncNow([path], {})

      if (!(await this.keepUntracked(path))) return 'tooLarge'

      const written = await write()

      if (written === 'saved') await this.syncNow([path], { causes: new Map([[path, 'restored']]) })

      return written
    }, 'failed')
  }

  /**
   * Точная правка агента из результата CLI: «до» восстанавливается снятием её ханков с
   * файла. Нужна, когда снимок «до» опоздал - CLI пишет файл раньше, чем IDE его прочитала,
   * а история этот файл не знала (игнорируемый, не открытый): событие без «до» получает его,
   * а несостоявшееся (снимок запомнил уже правленый файл) - появляется.
   */
  recoverAgentEdit(path: string, hunks: readonly EditHunk[]): Promise<void> {
    return this.queued(async () => {
      const absolute = resolveInsideRoot(this.path, path)
      const info = absolute ? await lstat(absolute).catch(() => null) : null

      if (!absolute || !info?.isFile() || info.size > HISTORY_FILE_MAX_BYTES) return

      const bytes = await readFile(absolute)
      const decoded = decodeText(bytes)
      const undone = decoded
        ? undoEdits(decoded.text, [{ kind: 'patch', hunks: [...hunks] }], true)
        : null

      if (!decoded || undone?.kind !== 'text') return

      const before = encodeText(undone.text, decoded.bom)
      const [key, beforeKey] = [contentKey(bytes), contentKey(before)]
      const { store } = this.host
      const latest = store.latest(this.id, path)
      const row = store.file(this.id, path)
      // Событие правки есть, но без «до» - или его нет вовсе: снимок застал уже правленый файл.
      const late = latest?.cause === 'agent' && latest.version === key && latest.previous === null
      const missed = (!row || row.key === key) && latest?.version !== key

      if (beforeKey === key || (!late && !missed)) return

      await this.host.blobs.keep(
        this.path,
        new Map([
          [beforeKey, before],
          [key, bytes],
        ]),
      )
      store.transaction(() => {
        if (late) return store.setPrevious(latest.id, beforeKey)

        const now = this.host.now()

        store.putFile(this.id, { path, key, size: bytes.length, mtimeMs: info.mtimeMs })
        store.addRevision(this.id, {
          path,
          at: now,
          startedAt: now,
          cause: 'agent',
          origin: null,
          previous: beforeKey,
          version: key,
        })
      })
      this.report([path])
    }, undefined)
  }

  /** Проект закрыли: новое не начинается, идущее дожидается. */
  async close(): Promise<void> {
    this.closed = true
    if (this.scanTimer) clearTimeout(this.scanTimer)
    // Отменённая сверка не держит тех, кто её ждёт.
    this.scanSettled()
    await this.chain.catch(() => undefined)
  }

  private readonly cause = (path: string) => this.host.causeOf(this.path, path)

  private report(paths: string[]): void {
    if (paths.length > 0) this.host.changed(this.path, paths)
  }

  private async syncNow(
    paths: readonly string[],
    { snapshot = false, causes = NO_CAUSES }: SyncOptions,
  ): Promise<boolean> {
    const known = new Map<string, FileRow>()

    for (const path of paths) {
      for (const row of this.host.store.filesUnder(this.id, path)) known.set(row.path, row)
    }

    // До первой полной сверки незнакомый файл - не новый: история его просто ещё не видела.
    // Но игнорируемое git пропускается и тогда: в историю его пускает только снимок.
    const remembers = snapshot || !this.scanned
    const strangers = paths.filter((path) => path !== '' && !known.has(path))
    const wanted = await this.wanted(strangers, snapshot, causes)
    const fresh = await this.newFiles(wanted, known, snapshot, causes)

    if (fresh === null) return false

    const names = new NameCheck(this.path)
    const observed = await lookAt(
      this.deps,
      [...known.keys(), ...fresh],
      known,
      () => names,
      () => true,
    )
    const causeOf = causesOf(causes, this.cause)

    const plan = planSync({ known, observed, baseline: remembers, snapshot, causeOf })

    this.report(await recordPlan(this.deps, plan))

    return true
  }

  private recordMove(from: string, to: string): void {
    const now = this.host.now()
    const { store } = this.host
    const moved = store.transaction(() => {
      const rows = store.moveTree(this.id, from, to)

      for (const { from: origin, row } of rows) {
        store.addRevision(this.id, {
          path: row.path,
          at: now,
          startedAt: now,
          cause: 'moved',
          origin,
          previous: row.key,
          version: row.key,
        })
      }

      return rows
    })

    if (moved.length > 0) this.report([from, to])
  }

  /**
   * Файл, который история не хранит (вырос больше предела), - скопировать к себе и помнить
   * перед возвратом поверх него. Больше потолка - false: возврат откажет, а не затрёт.
   */
  private async keepUntracked(path: string): Promise<boolean> {
    const absolute = resolveInsideRoot(this.path, path)
    const info = absolute ? await lstat(absolute).catch(() => null) : null

    if (!absolute || !info?.isFile() || info.size <= HISTORY_FILE_MAX_BYTES) return true
    if (info.size > RESTORE_KEEP_MAX_BYTES) return false

    const bytes = await readFile(absolute)
    const key = contentKey(bytes)

    await this.host.blobs.keep(this.path, new Map([[key, bytes]]))
    this.host.store.putFile(this.id, { path, key, size: bytes.length, mtimeMs: info.mtimeMs })

    return true
  }

  /** Работа в очереди проекта; её сбой - тому, кто ждёт, очередь идёт дальше. */
  private exclusive<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job, job)

    this.chain = run.catch(() => undefined)

    return run
  }

  /**
   * Работа в очереди проекта. Сбой не валит ни очередь, ни того, кто ждёт: история - не то,
   * из-за чего не сохраняется файл. В журнал - сбой, ждущему - fallback; он же - работе,
   * дождавшейся очереди уже после закрытия проекта.
   */
  private queued<T>(job: () => T | Promise<T>, fallback: T): Promise<T> {
    return this.exclusive(async () => (this.closed ? fallback : job())).catch((error: unknown) => {
      console.warn('[history] сверка упала:', error)

      return fallback
    })
  }

  private async runScan(): Promise<void> {
    this.scanTimer = null
    this.scanning = true
    await this.scanAll()
    this.scanning = false
    this.lastScanAt = this.host.now()

    if (this.scanAgain) {
      this.scanAgain = false
      this.requestScan()
    }
  }

  /**
   * Из незнакомых путей - нужные истории: снимок (открытый файл, правка агента) берёт всё,
   * иначе - объявленные пишущим и не игнорируемые git.
   */
  private async wanted(
    paths: readonly string[],
    snapshot: boolean,
    causes: ReadonlyMap<string, HistoryCause>,
  ): Promise<string[]> {
    if (snapshot) return [...paths]

    const declared = (path: string) => causes.has(path) || this.cause(path) !== null
    const ignored = await this.ignored(paths.filter((path) => !declared(path)))

    return paths.filter((path) => !ignored.has(path))
  }

  /**
   * Незнакомые пути - в файлы: появившаяся папка, где история ничего не помнит, - её файлы
   * (слежение назвало только папку), без игнорируемых внутри. Слишком большая папка - null.
   */
  private async newFiles(
    paths: readonly string[],
    known: ReadonlyMap<string, FileRow>,
    snapshot: boolean,
    causes: ReadonlyMap<string, HistoryCause>,
  ): Promise<string[] | null> {
    const files: string[] = []

    for (const path of paths) {
      const absolute = resolveInsideRoot(this.path, path)
      const info = absolute ? await lstat(absolute).catch(() => null) : null
      const remembered = [...known.keys()].some((row) => row.startsWith(`${path}/`))

      if (!absolute || !info?.isDirectory()) {
        files.push(path)
      } else if (!remembered) {
        // Вне git тяжёлые папки обходятся по имени, в git их судит .gitignore.
        const inside = await filesInFolder(
          this.path,
          absolute,
          NEW_FOLDER_MAX_FILES,
          !(await this.isGit()),
        )

        if (inside === null) return null

        files.push(...(await this.wanted(inside, snapshot, causes)))
      }
    }

    return files
  }

  private isGit(): Promise<boolean> {
    this.inGit ??= isGitScope(this.path).catch(() => false)

    return this.inGit
  }

  private async ignored(paths: readonly string[]): Promise<Set<string>> {
    return ignoredPaths(this.path, paths, await this.isGit())
  }
}
