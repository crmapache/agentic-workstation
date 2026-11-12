import { join } from 'node:path'

import type { ProviderId } from '@shared/providers'
import type {
  StatsFilter,
  StatsPeriod,
  StatsReport,
  StatsTurnNote,
  StatsManualNote,
  StatsPresenceNote,
  StatsScanProgress,
  StatsIdeSessionKind,
  StatsPermissionNote,
  StatsScenarioRunNote,
} from '@shared/statistics'

import type { PlaceProject } from './stats-engine'
import { STATS_DB_FILE, SCAN_INTERVAL_MS, CHANGED_THROTTLE_MS } from './stats.constants'
import type { EngineLink, EngineLinkFactory } from './engine/engine-link'
import type { LiveNote } from './live/live-notes'
import type { ProjectOf } from './places/git-root'
import { nearestGitRoot } from './places/git-root'

export type StatsServiceDeps = {
  /** Папка состояния IDE (userData): там лежит statistics.sqlite. */
  dataDir: string
  /** Папка транскриптов CLI - projects/ в доме CLI (claudeHome). */
  projectsDir: () => Promise<string>
  /** Как поднять движок: поток в приложении (stats-setup.ts), процесс в тестах. */
  link: EngineLinkFactory
  /** Числа изменились - окну пора перезапросить (не чаще CHANGED_THROTTLE_MS). */
  onChanged: () => void
  now?: () => number
  scanIntervalMs?: number
  changedThrottleMs?: number
}

const IDLE_PROGRESS: StatsScanProgress = {
  running: false,
  firstPassDone: false,
  filesDone: 0,
  filesTotal: 0,
  bytesDone: 0,
  bytesTotal: 0,
  lastScanAt: null,
}

/**
 * Статистика IDE: движок в своём потоке (база, транскрипты, выборки), здесь - расписание
 * чтения, проекты папок и живые события. Проект папки решает главный процесс (он знает
 * открытые проекты и worktree сценариев), движок только хранит ответ.
 */
export class StatsService {
  private link: EngineLink | null = null
  private projectOf: ProjectOf = nearestGitRoot()
  private timer: NodeJS.Timeout | null = null
  private changedTimer: NodeJS.Timeout | null = null
  private lastChanged = 0
  private scanning: Promise<void> | null = null
  private scanProgress: StatsScanProgress = IDLE_PROGRESS
  private readonly now: () => number

  constructor(private readonly deps: StatsServiceDeps) {
    this.now = deps.now ?? Date.now
  }

  /** Как идёт чтение транскриптов (для «считаю» в окне). */
  get progress(): StatsScanProgress {
    return this.scanProgress
  }

  /**
   * Поднять движок, заново решить проекты всех папок (правило могло поменяться), начать
   * первый проход и дальше дочитывать раз в минуту. Ответ - когда движок готов, не дожидаясь
   * прохода: первый проход по гигабайтам идёт фоном.
   */
  async start(projectOf?: ProjectOf): Promise<void> {
    if (projectOf) this.projectOf = projectOf
    if (this.link) return

    this.link = this.deps.link(join(this.deps.dataDir, STATS_DB_FILE), (progress) => {
      this.scanProgress = progress
      this.changed()
    })
    // База не открылась - окно получит ошибку на запросе, а IDE работает дальше.
    await this.resolvePlaces(true).catch((error: unknown) => {
      console.warn('[statistics] engine is not available', error)
    })
    void this.scanNow()
    this.timer = setInterval(
      () => void this.scanNow(),
      this.deps.scanIntervalMs ?? SCAN_INTERVAL_MS,
    )
    this.timer.unref()
  }

  /** Дочитать транскрипты сейчас; идущий проход не дублируется. */
  scanNow(): Promise<void> {
    this.scanning ??= this.scan().finally(() => {
      this.scanning = null
    })

    return this.scanning
  }

  /** Проекты открыты или закрыты - решить проекты папок заново. */
  async refreshProjects(projectOf?: ProjectOf): Promise<void> {
    if (projectOf) this.projectOf = projectOf

    await this.resolvePlaces(true)
  }

  async query(period: StatsPeriod, filter: StatsFilter): Promise<StatsReport> {
    return this.engine().request({ op: 'query', period, filter, now: this.now() })
  }

  noteIdeSession(provider: ProviderId, session: string, kind: StatsIdeSessionKind): void {
    this.note({ kind: 'ideSession', provider, session, ideKind: kind, at: this.now() })
  }

  noteTurn(note: StatsTurnNote): void {
    this.note({ kind: 'turn', note })
  }

  notePermission(note: StatsPermissionNote): void {
    this.note({ kind: 'permission', note })
  }

  notePresence(entries: StatsPresenceNote[]): void {
    if (entries.length > 0) this.note({ kind: 'presence', entries })
  }

  noteManual(rows: StatsManualNote[]): void {
    if (rows.length > 0) this.note({ kind: 'manual', rows })
  }

  noteScenarioRun(summary: StatsScenarioRunNote): void {
    this.note({ kind: 'scenarioRun', note: summary })
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    if (this.changedTimer) clearTimeout(this.changedTimer)

    this.timer = null
    this.changedTimer = null

    const link = this.link

    // Идущий проход не ждём: поток гасится, незафиксированный кусок отбрасывается базой
    // (WAL), и следующий запуск продолжит с последнего зафиксированного смещения.
    this.link = null
    await link?.close()
  }

  private engine(): EngineLink {
    if (!this.link) throw new Error('statistics service is not started')

    return this.link
  }

  private note(note: LiveNote) {
    if (!this.link) return

    this.link.request({ op: 'note', note }).then(
      () => this.changed(),
      (error: unknown) => console.warn('[statistics] note failed', note.kind, error),
    )
  }

  private async scan() {
    const link = this.link

    if (!link) return

    try {
      const result = await link.request({ op: 'scan', root: await this.deps.projectsDir() })

      await this.resolvePlaces(false)

      if (result.changed) this.changed()
    } catch (error) {
      console.warn('[statistics] transcript scan failed', error)
    }
  }

  /** Проекты папок: все (start, refreshProjects) или только новые (после прохода). */
  private async resolvePlaces(all: boolean) {
    const link = this.link

    if (!link) return

    const places = await link.request({ op: 'places', onlyUnresolved: !all })
    const changes: PlaceProject[] = []

    for (const place of places) {
      const project = await Promise.resolve()
        .then(() => this.projectOf(place.path))
        .catch(() => null)

      if (project !== place.project) changes.push({ id: place.id, project })
    }

    if (changes.length === 0) return

    await link.request({ op: 'setProjects', rows: changes })
    this.changed()
  }

  /** Сказать окну, что числа изменились, - не чаще раза в CHANGED_THROTTLE_MS. */
  private changed() {
    const throttle = this.deps.changedThrottleMs ?? CHANGED_THROTTLE_MS
    const wait = this.lastChanged + throttle - this.now()

    if (this.changedTimer) return
    if (wait <= 0) return this.emitChanged()

    this.changedTimer = setTimeout(() => this.emitChanged(), wait)
    this.changedTimer.unref()
  }

  private emitChanged() {
    this.changedTimer = null
    this.lastChanged = this.now()
    this.deps.onChanged()
  }
}
