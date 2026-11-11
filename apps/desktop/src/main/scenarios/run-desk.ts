import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import type { ImageAttachment } from '@shared/claude'
import type { RunSummary, ScenarioRun } from '@shared/scenario-runs'
import type { ScenarioRunControl } from '@shared/scenario-view'

import type { ScenarioProvider } from '../providers/scenario-provider'
import { transcriptIn } from './scenario-launch'
import type { EngineHost } from './engine/engine-core'
import type { ScenarioEngine } from './engine/scenario-engine'
import type { SessionSpawn } from './engine/scenario-session'
import { HiddenBook } from './store/hidden-book'
import { LockedFile, projectKey } from './store/locked-file'
import { RunStore } from './store/run-store'
import { summarise } from './store/run-summary'
import { ScenarioStore } from './store/scenario-store'
import { ScheduleStore } from './store/schedule-store'

/** Как часто смотреть на идущие прогоны и сколько ждать, чтобы писать и рассылать. */
const REDRAW_MS = 250
const LIVE_MS = 1_000
const WRITE_MS = 2_000
/** Живой прогон пишется хотя бы так часто: момент записи закрывает брошенный прогон. */
const VOUCH_MS = 30_000

export type DeskHost = {
  projectPath: string
  dataDir: string
  claudeHome: () => Promise<string>
  onLive: () => void
  onRun: (run: ScenarioRun) => void
  /** Прогон кончился, как бы ни кончился: записан на диск, место освобождено. */
  onFinished: (run: ScenarioRun) => void
  notify: (title: string, body: string) => void
  /** Свой подъём процесса вместо провайдера - подделка в тестах. */
  spawn?: SessionSpawn | undefined
}

/** Идущий прогон и его запись на диск. */
export type Live = {
  engine: ScenarioEngine
  dirty: boolean
  lastWrite: number
  writing: Promise<void>
}

/**
 * Прогоны одного проекта: полки, запись прогонов, расписание, книжка скрытых разговоров и
 * идущие движки. Очереди - выше, у сервиса: им всё равно, в каком проекте прогон, а стол -
 * про то, как прогон живёт и пишется. Сводки идущих - раз в секунду, запись прогона целиком -
 * по кругу, один за удар: при пяти прогонах иначе это двадцать перерисовок в секунду.
 */
export class RunDesk {
  readonly store: ScenarioStore
  readonly runs: RunStore
  readonly schedules: ScheduleStore
  readonly hidden: HiddenBook
  readonly live = new Map<string, Live>()
  private redraw: NodeJS.Timeout | null = null
  private lastLive = 0
  private lastSent = ''
  private swept = false
  /** Концы прогонов, которые ещё пишутся: выход из IDE их дожидается. */
  private readonly endings = new Set<Promise<void>>()
  private closing = false

  constructor(readonly host: DeskHost) {
    const key = projectKey(host.projectPath)
    const file = (folder: string, name: string) =>
      new LockedFile(join(host.dataDir, folder, key, name))

    this.store = new ScenarioStore(host.projectPath, host.claudeHome)
    this.runs = new RunStore(join(host.dataDir, 'scenario-runs', key))
    this.schedules = new ScheduleStore(file('scenario-schedules', 'schedules.json'))
    this.hidden = new HiddenBook(file('scenario-conversations', 'conversations.json'), () =>
      this.runs.conversations(),
    )
  }

  /** Брошенные прогоны (IDE закрыли посреди работы) закрываются при первом обращении. */
  async sweep(): Promise<void> {
    if (this.swept) return

    this.swept = true
    await this.runs.repairAbandoned(new Set(this.live.keys()))
  }

  liveRuns(): RunSummary[] {
    return [...this.live.values()].map((holder) => summarise(holder.engine.run))
  }

  sendLive(): void {
    this.lastLive = Date.now()
    this.host.onLive()
  }

  /**
   * Что движку нужно от IDE, на прогон: процессы - у провайдера в папке прогона (проект или
   * worktree), транскрипты - там же, где провайдер их пишет для этой папки.
   */
  engineHost(runId: string, provider: ScenarioProvider, cwd: string, dirs: string[]): EngineHost {
    const place = { cwd, projectPath: this.host.projectPath }

    return {
      projectPath: cwd,
      spawn: (spec, wires) =>
        this.host.spawn ? this.host.spawn(spec, wires) : provider.spawn(spec, place, wires),
      onDisk: (sessionId) => transcriptIn(dirs, sessionId) !== null,
      transcriptPath: (sessionId) => transcriptIn(dirs, sessionId),
      newSessionId: () => randomUUID(),
      defaults: provider.defaults,
      accounts: provider.accounts,
      onChange: () => {
        const holder = this.live.get(runId)

        if (holder) holder.dirty = true
      },
      onFinished: (run) => {
        const ending = this.ended(run)

        this.endings.add(ending)
        void ending.finally(() => this.endings.delete(ending))
      },
      notify: (body) => {
        const run = this.live.get(runId)?.engine.run

        if (run) this.host.notify(run.scenarioName, body)
      },
      noteConversation: (id) => void this.hidden.note(id),
    }
  }

  /** Записать прогон - по очереди: запись «идёт» не должна лечь поверх записи конца. */
  keep(runId: string, run: ScenarioRun, now = Date.now()): Promise<void> {
    const holder = this.live.get(runId)
    const write = () => this.runs.keep(run, now)

    if (!holder) return write()

    holder.writing = holder.writing.then(write)

    return holder.writing
  }

  claim(runId: string, engine: ScenarioEngine): Live {
    const holder: Live = { engine, dirty: false, lastWrite: Date.now(), writing: Promise.resolve() }

    this.live.set(runId, holder)
    this.redraw ??= setInterval(() => this.pulse(), REDRAW_MS)

    return holder
  }

  release(runId: string): void {
    this.live.delete(runId)

    if (this.live.size === 0 && this.redraw) {
      clearInterval(this.redraw)
      this.redraw = null
    }
  }

  /** Прогон кончился: запись, уведомление и решение очереди - у сервиса. */
  async ended(run: ScenarioRun): Promise<void> {
    const holder = this.live.get(run.id)

    await this.keep(run.id, run)
    await holder?.writing
    this.release(run.id)
    this.host.onRun(run)
    this.sendLive()

    // IDE закрывается: прогоны пишутся остановленными молча, очередь не поднимает следующий.
    if (this.closing) return

    this.host.notify(run.scenarioName, endingOf(run))
    this.host.onFinished(run)
  }

  control(runId: string, action: ScenarioRunControl): void {
    const engine = this.live.get(runId)?.engine

    if (action === 'pause') engine?.pause()
    else if (action === 'resume') engine?.resume()
    else engine?.stop()
  }

  answer(runId: string, allow: boolean, text: string): void {
    this.live.get(runId)?.engine.answer(allow, text)
  }

  tell(runId: string, text: string, images: readonly ImageAttachment[], tokens: unknown): boolean {
    return this.live.get(runId)?.engine.tell(text, images, tokens) ?? false
  }

  follow(to: string): void {
    for (const holder of this.live.values()) holder.engine.follow(to)
  }

  async run(runId: string): Promise<ScenarioRun | null> {
    return this.live.get(runId)?.engine.run ?? (await this.runs.read(runId))
  }

  /** Выход из IDE: идущие прогоны останавливаются (их можно подхватить) и дописываются. */
  async shutdown(): Promise<void> {
    this.closing = true

    for (const holder of [...this.live.values()]) holder.engine.stop()

    await Promise.all([...this.endings])
  }

  get isClosing(): boolean {
    return this.closing
  }

  /** Удар сердца: сводки раз в секунду, записи на диск, полная запись - одному прогону. */
  private pulse() {
    const now = Date.now()
    const holders = [...this.live.entries()].sort(([left], [right]) => left.localeCompare(right))

    if (holders.length === 0) return
    if (now - this.lastLive >= LIVE_MS) this.sendLive()

    for (const [runId, holder] of holders) {
      if (now - holder.lastWrite >= (holder.dirty ? WRITE_MS : VOUCH_MS)) {
        holder.lastWrite = now
        void this.keep(runId, holder.engine.run, now)
      }
    }

    const from = Math.max(
      0,
      holders.findIndex(([runId]) => runId > this.lastSent),
    )

    for (let step = 0; step < holders.length; step += 1) {
      const [runId, holder] = holders[(from + step) % holders.length] ?? []

      if (!runId || !holder?.dirty) continue

      holder.dirty = false
      this.lastSent = runId
      this.host.onRun(holder.engine.run)

      return
    }
  }
}

/** Как кончился - словами уведомления (IDE говорит по-английски). */
const endingOf = (run: ScenarioRun): string => {
  if (run.state === 'done') return 'finished'
  if (run.state === 'stopped') return 'stopped'

  return run.error || 'stopped on a failure'
}
