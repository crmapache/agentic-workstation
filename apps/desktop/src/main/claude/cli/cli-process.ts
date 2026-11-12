import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'

import { SPAWN_DETACHED } from '../../platform'
import type { CliMessage, ControlRequest } from './cli-messages'
import { parseCliLine, isControlRequest } from './cli-messages'
import { STDERR_TAIL_CHARS } from './cli.constants'
import { ProcessGroup } from './process-group'
import type { Environment } from './shell-env'

export type CliProcessEvents = {
  /** Любая строка потока, кроме управляющих: её разбирает лента. */
  onMessage: (message: CliMessage) => void
  /** CLI спрашивает хоста: разрешение на инструмент и подобное. */
  onControlRequest: (request: ControlRequest) => void
  /** Процесс завершился. stderrTail - последние строки stderr для журнала. */
  onExit: (code: number | null, stderrTail: string) => void
}

export type CliSpawnOptions = { binary: string; args: string[]; cwd: string; env: Environment }

/** CLI ответил на управляющий запрос отказом: текст - его, английский, человеку понятен. */
export class CliReplyError extends Error {}

/** Процесс CLI закрылся, не ответив: подробностей у этого нет. */
export class CliExitedError extends Error {
  constructor() {
    super('CLI process exited')
  }
}

type PendingControl = { resolve: (response: unknown) => void; reject: (error: Error) => void }

/**
 * Один процесс `claude` в режиме потока JSON: строки в stdin, строки из stdout.
 * Управляющие ответы на наши запросы (interrupt, set_model) сопоставляются по
 * request_id, остальное уходит слушателям. Процесс живёт в своей группе: его Bash
 * запускает дочерние процессы, и гасить надо всех (`ProcessGroup`).
 */
export class CliProcess {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly group: ProcessGroup
  private readonly pending = new Map<string, PendingControl>()
  private stderrTail = ''
  private exited = false

  constructor(options: CliSpawnOptions, events: CliProcessEvents) {
    this.child = spawn(options.binary, options.args, {
      cwd: options.cwd,
      env: options.env,
      detached: SPAWN_DETACHED,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.group = new ProcessGroup(this.child)

    createInterface({ input: this.child.stdout }).on('line', (line) => {
      const message = parseCliLine(line)

      if (!message) return

      // Сбой в обработчике одной строки не должен рвать разбор всего потока.
      try {
        if (message.type === 'control_response') this.settleControl(message)
        else if (isControlRequest(message)) events.onControlRequest(message)
        else events.onMessage(message)
      } catch (error) {
        console.warn('[claude] строка CLI не обработалась:', message.type, error)
      }
    })

    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-STDERR_TAIL_CHARS)
    })

    // Ошибка записи в stdin умершего процесса: сам выход придёт событием exit.
    this.child.stdin.on('error', () => undefined)

    this.child.on('error', (error: Error) => {
      this.stderrTail = `${this.stderrTail}\n${error.message}`.slice(-STDERR_TAIL_CHARS)
    })

    this.child.on('close', (code) => {
      this.exited = true

      for (const { reject } of this.pending.values()) reject(new CliExitedError())

      this.pending.clear()
      events.onExit(code, this.stderrTail)
    })
  }

  /** Живой и не гасится: только такому процессу можно отдавать новый ход. */
  get isAlive(): boolean {
    return !this.exited && !this.group.isStopping
  }

  /** Сигнал уже ушёл, но процесс ещё не закрылся (до KILL_GRACE_MS у зависшего CLI). */
  get isStopping(): boolean {
    return this.group.isStopping && !this.exited
  }

  /** Строка JSON в stdin. После выхода процесса - ничего не делает. */
  write(message: object): void {
    if (this.exited) return

    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  /**
   * Управляющий запрос к CLI и его ответ. requestId - свой, когда запрос потом отменяют
   * (вопрос сбоку) или ловят его строки прогресса.
   */
  control(request: Record<string, unknown>, requestId: string = randomUUID()): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.exited) return reject(new CliExitedError())

      this.pending.set(requestId, { resolve, reject })
      this.write({ type: 'control_request', request_id: requestId, request })
    })
  }

  /** Отменить свой управляющий запрос: CLI закончит его ответом-ошибкой. */
  cancelControl(requestId: string): void {
    if (this.pending.has(requestId)) {
      this.write({ type: 'control_cancel_request', request_id: requestId })
    }
  }

  /** Ответ на управляющий запрос CLI (разрешение на инструмент). */
  respond(requestId: string, response: Record<string, unknown>): void {
    this.write({
      type: 'control_response',
      response: { subtype: 'success', request_id: requestId, response },
    })
  }

  /** Погасить процесс и всё, что он запустил: сначала мягко, через паузу - насильно. */
  kill(): void {
    void this.stop()
  }

  /**
   * То же, но с ожиданием: обещание сбывается, когда процесс закрылся. Выход из IDE
   * ждёт его - таймер добивания в уже закрывшемся главном процессе не сработал бы.
   */
  stop(): Promise<void> {
    return this.group.stop()
  }

  private settleControl(message: CliMessage) {
    const response = message['response'] as
      { request_id?: string; subtype?: string; error?: string; response?: unknown } | undefined
    const waiter = response?.request_id ? this.pending.get(response.request_id) : undefined

    if (!response?.request_id || !waiter) return

    this.pending.delete(response.request_id)

    if (response.subtype === 'error') waiter.reject(new CliReplyError(response.error ?? ''))
    else waiter.resolve(response.response)
  }
}
