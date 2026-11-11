import { randomUUID } from 'node:crypto'

import type {
  TerminalOpened,
  TerminalOutput,
  TerminalReplay,
  TerminalSession,
} from '@shared/terminal'

import { OutputLog } from './output-log'
import { nextOrdinal } from './session-ordinal'
import { FLOW_LOW, FLUSH_MS, FLOW_HIGH, REPLAY_LIMIT, KILL_GRACE_MS } from './terminal.constants'
import type { LiveSession, TerminalSetup } from './terminal.types'

/** Что сервис сообщает наружу: вывод оболочки и смену набора сессий. */
export type TerminalHooks = {
  output: (output: TerminalOutput) => void
  sessions: (sessions: TerminalSession[]) => void
}

/** Сигнал оболочке; вышедшая уже не ответит, и это не ошибка. */
const signal = (live: LiveSession, name: 'SIGHUP' | 'SIGKILL') => {
  try {
    live.pty.kill(name)
  } catch {
    // Процесс уже вышел.
  }
}

/**
 * Терминалы IDE (ADR 0037): оболочка проекта в псевдотерминале, вывод - окну кусками, с
 * паузой оболочки, когда окно не успевает рисовать. Сессии живут в главном процессе:
 * перезагрузка окна их не рвёт, окно подключается к хвосту вывода (replay). Закрытая
 * вкладка, закрытый проект и выход IDE гасят оболочку: SIGHUP, через KILL_GRACE_MS - SIGKILL.
 */
export class TerminalService {
  private readonly live = new Map<string, LiveSession>()
  /** Закрытые, но ещё не вышедшие оболочки: выход IDE ждёт и их. */
  private readonly dying = new Set<LiveSession>()

  constructor(
    private readonly hooks: TerminalHooks,
    private readonly setup: TerminalSetup,
  ) {}

  list(): TerminalSession[] {
    return [...this.live.values()].map((live) => live.session)
  }

  /** Новая оболочка в корне проекта; номер вкладки - наименьший свободный в проекте. */
  async open(projectId: string, rootPath: string, cols: number, rows: number) {
    let pty: LiveSession['pty']

    try {
      const shell = this.setup.shell()

      pty = await this.setup.spawn(shell, ['-l'], {
        cwd: rootPath,
        cols,
        rows,
        env: await this.setup.env(shell),
      })
    } catch (error) {
      console.warn('[terminal] оболочка не запустилась:', error)

      return { sessions: this.list(), created: null } satisfies TerminalOpened
    }

    // Номер - после запуска: две вкладки, открытые разом, иначе взяли бы один и тот же.
    const taken = this.list()
      .filter((session) => session.projectId === projectId)
      .map((session) => session.ordinal)
    const session: TerminalSession = { id: randomUUID(), projectId, ordinal: nextOrdinal(taken) }
    let markExited = (): void => undefined
    const live: LiveSession = {
      session,
      pty,
      log: new OutputLog(REPLAY_LIMIT),
      pending: '',
      flushTimer: null,
      unacked: 0,
      paused: false,
      exited: new Promise<void>((resolve) => {
        markExited = resolve
      }),
    }

    pty.onData((data) => this.received(live, data))
    pty.onExit(() => {
      this.exited(live)
      markExited()
    })
    this.live.set(session.id, live)

    return { sessions: this.list(), created: session.id } satisfies TerminalOpened
  }

  /** Закрыть вкладку. Оболочка гаснет в фоне, набор сессий - сразу без неё. */
  close(sessionId: string): TerminalSession[] {
    const live = this.live.get(sessionId)

    if (live) {
      this.live.delete(sessionId)
      this.stop(live)
    }

    return this.list()
  }

  /** Сессии закрытых проектов гаснут; окну - новый набор, если что-то закрылось. */
  keepProjects(projectIds: readonly string[]): void {
    const gone = this.list().filter((session) => !projectIds.includes(session.projectId))

    for (const session of gone) this.close(session.id)
    if (gone.length > 0) this.hooks.sessions(this.list())
  }

  write(sessionId: string, data: string): void {
    this.live.get(sessionId)?.pty.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    try {
      this.live.get(sessionId)?.pty.resize(cols, rows)
    } catch (error) {
      // Оболочка вышла между вызовами - размер ей уже не нужен.
      console.warn('[terminal] размер не применился:', error)
    }
  }

  /** Хвост вывода для подключения заново; всё до него окно считает показанным. */
  replay(sessionId: string): TerminalReplay | null {
    const live = this.live.get(sessionId)

    if (!live) return null

    live.unacked = 0
    this.flow(live)

    return live.log.snapshot()
  }

  /** Окно дорисовало chars знаков: отставание меньше, оболочка может снова писать. */
  ack(sessionId: string, chars: number): void {
    const live = this.live.get(sessionId)

    if (!live) return

    live.unacked = Math.max(0, live.unacked - chars)
    this.flow(live)
  }

  /** Выход IDE: гаснут все оболочки, ждём их (SIGKILL через KILL_GRACE_MS сам добьёт). */
  async shutdown(): Promise<void> {
    for (const sessionId of [...this.live.keys()]) this.close(sessionId)

    await Promise.allSettled([...this.dying].map((live) => live.exited))
  }

  /** Главный процесс уходит, не дождавшись: добить всех сразу. */
  killAllNow(): void {
    for (const live of [...this.live.values(), ...this.dying]) signal(live, 'SIGKILL')
  }

  private received(live: LiveSession, data: string): void {
    live.log.append(data)
    live.pending += data
    live.unacked += data.length
    this.flow(live)
    live.flushTimer ??= setTimeout(() => this.flush(live), FLUSH_MS)
  }

  private flush(live: LiveSession): void {
    if (live.flushTimer) clearTimeout(live.flushTimer)

    live.flushTimer = null

    if (!live.pending) return

    this.hooks.output({ sessionId: live.session.id, data: live.pending, end: live.log.end })
    live.pending = ''
  }

  /** Пауза, когда окно отстало на FLOW_HIGH, и ход, когда догнало до FLOW_LOW. */
  private flow(live: LiveSession): void {
    if (!live.paused && live.unacked > FLOW_HIGH) {
      live.paused = true
      live.pty.pause()
    } else if (live.paused && live.unacked < FLOW_LOW) {
      live.paused = false
      live.pty.resume()
    }
  }

  /** Оболочка вышла сама (exit) или погашена: последний вывод - окну, вкладка уходит. */
  private exited(live: LiveSession): void {
    this.flush(live)
    this.dying.delete(live)

    if (this.live.get(live.session.id) !== live) return

    this.live.delete(live.session.id)
    this.hooks.sessions(this.list())
  }

  private stop(live: LiveSession): void {
    this.flush(live)
    this.dying.add(live)
    signal(live, 'SIGHUP')

    const timer = setTimeout(() => signal(live, 'SIGKILL'), KILL_GRACE_MS)

    void live.exited.finally(() => clearTimeout(timer))
  }
}
