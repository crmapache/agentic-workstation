import type { ChildProcess } from 'node:child_process'

import { IS_WINDOWS } from '../../platform'
import { killProcessTree, killProcessTreeNow } from '../../windows/process-tree'
import { KILL_GRACE_MS } from './cli.constants'

/**
 * Дочерний процесс IDE в своей группе (spawn с detached): процесс CLI, команда «!»,
 * разовая команда CLI. Гасится вся группа - всё, что он запустил (Bash, MCP-серверы,
 * git clone). Все живые группы учтены здесь: выход из IDE ждёт их, а при внезапном
 * выходе добивает разом. Иначе «!npm run dev» пережил бы IDE и держал порт. На Windows групп
 * нет (spawn без detached, SPAWN_DETACHED): дерево гасит taskkill /T сразу и насильно - мягкого
 * сигнала консольному процессу там нет, а дождись корень выхода, его потомки остались бы без
 * родителя, и /T их уже не нашёл бы. После выхода корня по его номеру не гасим ничего: номер
 * Windows могла отдать чужому процессу.
 */
export class ProcessGroup {
  private static readonly live = new Set<ProcessGroup>()

  /** Сбывается, когда процесс закрылся (или не запустился вовсе). */
  readonly closed: Promise<void>
  private exited = false
  /** Корень вышел (exit; close может прийти позже - потомок держит его вывод). */
  private rootExited = false
  private stopping = false

  constructor(private readonly child: ChildProcess) {
    ProcessGroup.live.add(this)
    this.closed = new Promise((resolve) => {
      const done = () => {
        this.exited = true
        ProcessGroup.live.delete(this)
        resolve()
      }

      child.once('exit', () => (this.rootExited = true))
      child.once('close', done)
      // Не запустился: pid нет, close может и не прийти.
      child.once('error', () => {
        if (child.pid === undefined) done()
      })
    })
  }

  get hasExited(): boolean {
    return this.exited
  }

  /** Сигнал «погасить» ушёл, а процесс ещё не закрылся. */
  get isStopping(): boolean {
    return this.stopping && !this.exited
  }

  /** Сначала мягко, через KILL_GRACE_MS - насильно; сбывается, когда процесс закрылся. */
  stop(): Promise<void> {
    if (this.exited) return this.closed
    if (this.stopping) return this.closed

    this.stopping = true
    this.signal(IS_WINDOWS ? 'SIGKILL' : 'SIGTERM')

    const timer = setTimeout(() => this.signal('SIGKILL'), KILL_GRACE_MS)

    return this.closed.finally(() => clearTimeout(timer))
  }

  /** Сразу насильно: потолок по времени вышел. */
  kill(): void {
    this.stopping = true
    this.signal('SIGKILL')
  }

  /** Погасить все и дождаться: выход из IDE. */
  static stopAll(): Promise<void> {
    return Promise.all([...ProcessGroup.live].map((group) => group.stop())).then(() => undefined)
  }

  /** Добить все разом и синхронно: последняя страховка, главный процесс уже уходит. */
  static killAllNow(): void {
    for (const group of ProcessGroup.live) {
      if (IS_WINDOWS && !group.rootExited && group.child.pid !== undefined) {
        killProcessTreeNow(group.child.pid)
      } else if (!IS_WINDOWS) group.signal('SIGKILL')
    }
  }

  private signal(signal: NodeJS.Signals) {
    if (this.exited || this.child.pid === undefined) return
    if (IS_WINDOWS) {
      if (!this.rootExited) void killProcessTree(this.child.pid)

      return
    }

    try {
      // Минус - вся группа.
      process.kill(-this.child.pid, signal)
    } catch {
      // Группа уже пуста - гасить нечего.
    }
  }
}
