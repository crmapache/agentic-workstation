import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'

import { SPAWN_DETACHED } from '../../platform'
import { ProcessGroup } from '../../process/process-group'
import type { RpcId, RpcLine } from '../../process/rpc-lines'
import { requestLine, parseRpcLine, responseLine, notificationLine } from '../../process/rpc-lines'
import type { Environment } from '../../process/shell-env'
import { launchTarget } from '../../windows/cmd-launch'
import {
  METHOD_NOT_FOUND,
  STDERR_TAIL_CHARS,
  REQUEST_TIMEOUT_MS,
  HANDSHAKE_TIMEOUT_MS,
  STDIN_CLOSE_GRACE_MS,
} from './app-server.constants'

export type AppServerEvents = {
  onNotification: (method: string, params: unknown) => void
  /** Запрос сервера к клиенту: вопрос разрешения, выбор. Ответ - respond / respondError. */
  onServerRequest: (id: RpcId, method: string, params: unknown) => void
  onExit: (code: number | null, stderrTail: string) => void
}

export type AppServerSpawn = {
  binary: string
  /** Аргументы после `app-server`: у нас это только `-c ключ=значение`. */
  args: string[]
  cwd: string
  env: Environment
  /** Кто мы для Codex (clientInfo рукопожатия). */
  client: { name: string; title: string; version: string }
}

/** Ответ сервера с ошибкой JSON-RPC. */
export class AppServerReplyError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message)
  }
}

/** Процесс кончился, ответа не будет. */
export class AppServerExitedError extends Error {
  constructor() {
    super('codex app-server exited')
  }
}

type Waiter = { resolve: (result: unknown) => void; reject: (error: Error) => void }

/**
 * Процесс `codex app-server` (ADR 0083, протокол - docs/plan-providers/30-codex.md):
 * построчный JSON-RPC через stdin и stdout. Запросы до рукопожатия ждут его, у каждого -
 * таймаут; запросы сервера уходят наружу событием и ждут ответа без таймера - человек
 * решает сколько угодно. Процесс - в группе процессов IDE: выход IDE его дождётся.
 */
export class AppServerProcess {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly group: ProcessGroup
  private readonly waiting = new Map<number, Waiter>()
  private readonly ready: Promise<void>
  private nextId = 1
  private stderrTail = ''
  private exited = false

  constructor(spawnSpec: AppServerSpawn, events: AppServerEvents) {
    // Codex из npm на Windows - обёртка codex.cmd: её - через cmd.exe.
    const target = launchTarget(spawnSpec.binary, ['app-server', ...spawnSpec.args])

    this.child = spawn(target.file, target.args, {
      cwd: spawnSpec.cwd,
      env: spawnSpec.env,
      detached: SPAWN_DETACHED,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsVerbatimArguments: target.verbatim,
    })
    this.group = new ProcessGroup(this.child)

    createInterface({ input: this.child.stdout }).on('line', (line) => {
      const message = parseRpcLine(line)

      if (!message) return

      // Сбой в обработчике одной строки не должен рвать разбор всего потока.
      try {
        this.take(message, events)
      } catch (error) {
        console.warn('[codex] строка app-server не обработалась:', message.kind, error)
      }
    })

    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-STDERR_TAIL_CHARS)
    })
    // Ошибка записи в stdin умершего процесса: сам выход придёт событием close.
    this.child.stdin.on('error', () => undefined)
    this.child.on('error', (error: Error) => {
      this.stderrTail = `${this.stderrTail}\n${error.message}`.slice(-STDERR_TAIL_CHARS)
    })
    this.child.on('close', (code) => {
      this.exited = true

      for (const waiter of this.waiting.values()) waiter.reject(new AppServerExitedError())

      this.waiting.clear()
      events.onExit(code, this.stderrTail)
    })

    this.ready = this.handshake(spawnSpec.client)
    // Рукопожатие не вышло - запросы откажут сами, а процесс гасится: без него он бесполезен.
    this.ready.catch(() => void this.stop())
  }

  get isAlive(): boolean {
    return !this.exited && !this.group.isStopping
  }

  get isStopping(): boolean {
    return this.group.isStopping && !this.exited
  }

  /** Запрос после рукопожатия; ответ - result, ошибка сервера - AppServerReplyError. */
  async request(
    method: string,
    params?: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    await this.ready

    return this.send(method, params, timeoutMs)
  }

  /** Уведомление серверу (без ответа). */
  notify(method: string, params?: unknown): void {
    this.write(notificationLine(method, params))
  }

  /** Ответ на запрос сервера. */
  respond(id: RpcId, result: unknown): void {
    this.write(responseLine(id, { result }))
  }

  respondError(id: RpcId, code: number, message: string): void {
    this.write(responseLine(id, { error: { code, message } }))
  }

  /**
   * Остановка как у amazing-codex: закрыть stdin - сервер дописывает журнал и выходит сам;
   * не вышел за паузу - сигнал группе (SIGTERM, потом SIGKILL).
   */
  async stop(): Promise<void> {
    if (this.exited) return

    this.child.stdin.end()

    await Promise.race([this.group.closed, delay(STDIN_CLOSE_GRACE_MS)])

    if (!this.exited) await this.group.stop()
  }

  kill(): void {
    this.group.kill()
  }

  private async handshake(client: AppServerSpawn['client']): Promise<void> {
    // Без experimentalApi план и вопросы с вариантами молча не работают.
    await this.send(
      'initialize',
      { clientInfo: client, capabilities: { experimentalApi: true } },
      HANDSHAKE_TIMEOUT_MS,
    )
    this.notify('initialized')
  }

  private send(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (this.exited) return Promise.reject(new AppServerExitedError())

    const id = this.nextId

    this.nextId += 1

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id)
        reject(new Error(`codex app-server: ${method} не ответил за ${timeoutMs} мс`))
      }, timeoutMs)

      timer.unref()
      this.waiting.set(id, {
        resolve: (result) => {
          clearTimeout(timer)
          resolve(result)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      this.write(requestLine(id, method, params))
    })
  }

  private take(message: RpcLine, events: AppServerEvents) {
    if (message.kind === 'notification')
      return events.onNotification(message.method, message.params)
    if (message.kind === 'request')
      return events.onServerRequest(message.id, message.method, message.params)

    const id = typeof message.id === 'number' ? message.id : Number(message.id)
    const waiter = this.waiting.get(id)

    if (!waiter) return

    this.waiting.delete(id)

    if (message.error)
      waiter.reject(new AppServerReplyError(message.error.code, message.error.message))
    else waiter.resolve(message.result)
  }

  private write(line: string) {
    if (!this.exited) this.child.stdin.write(line)
  }
}

/** Ответ «такого запроса не знаю» - для запросов сервера, которых клиент не умеет. */
export const refuseUnknown = (server: AppServerProcess, id: RpcId, method: string): void =>
  server.respondError(id, METHOD_NOT_FOUND, `Unsupported request: ${method}`)
