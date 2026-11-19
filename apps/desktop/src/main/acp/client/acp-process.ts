import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'

import { SPAWN_DETACHED } from '../../platform'
import type { AcpInitializeResult } from '../protocol/acp-types'
import { ProcessGroup } from '../../process/process-group'
import type { RpcId, RpcLine } from '../../process/rpc-lines'
import { requestLine, parseRpcLine, responseLine, notificationLine } from '../../process/rpc-lines'
import type { Environment } from '../../process/shell-env'
import { launchTarget } from '../../windows/cmd-launch'
import {
  ACP_AUTH_REQUIRED,
  ACP_METHOD_NOT_FOUND,
  ACP_PROTOCOL_VERSION,
  ACP_STDERR_TAIL_CHARS,
  ACP_REQUEST_TIMEOUT_MS,
  ACP_HANDSHAKE_TIMEOUT_MS,
  ACP_STDIN_CLOSE_GRACE_MS,
} from './acp.constants'

/** Запрос агента к клиенту: ответ - результат, отказ - AcpReplyError с кодом. */
export type AcpAgentRequestHandler = (method: string, params: unknown) => Promise<unknown>

export type AcpProcessEvents = {
  onNotification: (method: string, params: unknown) => void
  /** Запрос агента (разрешение, форма); незнакомый - отказ `-32601`. */
  onRequest: AcpAgentRequestHandler
  onExit: (code: number | null, stderrTail: string) => void
}

export type AcpSpawn = {
  binary: string
  /** Аргументы целиком: у `agy` - `acp --gemini-dir ...`, у Kimi - `acp`. */
  args: string[]
  cwd: string
  env: Environment
  /** Что IDE объявляет агенту (`clientCapabilities`). */
  capabilities: Record<string, unknown>
  version: string
}

/** Ответ агента с ошибкой JSON-RPC. */
export class AcpReplyError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data: unknown = undefined,
  ) {
    super(message)
  }
}

/** Процесс кончился, ответа не будет. */
export class AcpExitedError extends Error {
  constructor() {
    super('ACP agent exited')
  }
}

type Waiter = { resolve: (result: unknown) => void; reject: (error: Error) => void }

/**
 * Процесс агента ACP (ADR 0092): JSON-RPC 2.0 построчно через stdin и stdout, как у
 * `codex app-server`. Запросы до рукопожатия ждут его, у каждого свой срок; запросы агента
 * (разрешение, форма) уходят обработчику и ждут ответа без срока - человек решает сколько
 * угодно. Процесс - в группе процессов IDE: выход IDE его дождётся.
 */
export class AcpProcess {
  /** Ответ `initialize`: что умеет агент, как в него войти. */
  readonly initialized: Promise<AcpInitializeResult>
  private readonly child: ChildProcessWithoutNullStreams
  private readonly group: ProcessGroup
  private readonly waiting = new Map<number, Waiter>()
  private nextId = 1
  private stderrTail = ''
  private exited = false

  constructor(spec: AcpSpawn, events: AcpProcessEvents) {
    // Kimi из npm на Windows - обёртка kimi.cmd: её - через cmd.exe.
    const target = launchTarget(spec.binary, spec.args)

    this.child = spawn(target.file, target.args, {
      cwd: spec.cwd,
      env: spec.env,
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
        console.warn('[acp] строка агента не обработалась:', message.kind, error)
      }
    })

    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-ACP_STDERR_TAIL_CHARS)
    })
    this.child.stdin.on('error', () => undefined)
    this.child.on('error', (error: Error) => {
      this.stderrTail = `${this.stderrTail}\n${error.message}`.slice(-ACP_STDERR_TAIL_CHARS)
    })
    this.child.on('close', (code) => {
      this.exited = true

      for (const waiter of this.waiting.values()) waiter.reject(new AcpExitedError())

      this.waiting.clear()
      events.onExit(code, this.stderrTail)
    })

    this.initialized = this.send(
      'initialize',
      {
        protocolVersion: ACP_PROTOCOL_VERSION,
        clientCapabilities: spec.capabilities,
        clientInfo: {
          name: 'agentic-workstation',
          title: 'Agentic Workstation',
          version: spec.version,
        },
      },
      ACP_HANDSHAKE_TIMEOUT_MS,
    ) as Promise<AcpInitializeResult>
    // Рукопожатие не вышло - запросы откажут сами, а процесс гасится: без него он бесполезен.
    this.initialized.catch(() => void this.stop())
  }

  get isAlive(): boolean {
    return !this.exited && !this.group.isStopping
  }

  get isStopping(): boolean {
    return this.group.isStopping && !this.exited
  }

  /** Последние строки stderr: причина отказа или падения. */
  get stderr(): string {
    return this.stderrTail
  }

  /** Запрос после рукопожатия; ответ - result, ошибка агента - AcpReplyError. */
  async request(
    method: string,
    params?: unknown,
    timeoutMs = ACP_REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    await this.initialized

    return this.send(method, params, timeoutMs)
  }

  /** Уведомление агенту (без ответа): `session/cancel`. */
  notify(method: string, params?: unknown): void {
    this.write(notificationLine(method, params, 'jsonrpc2'))
  }

  /**
   * Остановка: закрыть stdin - агент дописывает разговор и выходит сам; не вышел за паузу -
   * сигнал группе (SIGTERM, потом SIGKILL).
   */
  async stop(): Promise<void> {
    if (this.exited) return

    this.child.stdin.end()

    await Promise.race([this.group.closed, delay(ACP_STDIN_CLOSE_GRACE_MS)])

    if (!this.exited) await this.group.stop()
  }

  kill(): void {
    this.group.kill()
  }

  private send(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (this.exited) return Promise.reject(new AcpExitedError())

    const id = this.nextId

    this.nextId += 1

    return new Promise((resolve, reject) => {
      // Срок 0 - без срока (ход ждёт человека сколько угодно); выход процесса и так отклонит запрос.
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              this.waiting.delete(id)
              reject(
                new Error(
                  `The agent did not answer ${method} in ${Math.round(timeoutMs / 1000)} s`,
                ),
              )
            }, timeoutMs)
          : null

      timer?.unref()
      this.waiting.set(id, {
        resolve: (result) => {
          if (timer) clearTimeout(timer)
          resolve(result)
        },
        reject: (error) => {
          if (timer) clearTimeout(timer)
          reject(error)
        },
      })
      this.write(requestLine(id, method, params, 'jsonrpc2'))
    })
  }

  private take(message: RpcLine, events: AcpProcessEvents) {
    if (message.kind === 'notification') {
      return events.onNotification(message.method, message.params)
    }
    if (message.kind === 'request')
      return this.answer(message.id, message.method, message.params, events)

    const id = typeof message.id === 'number' ? message.id : Number(message.id)
    const waiter = this.waiting.get(id)

    if (!waiter) return

    this.waiting.delete(id)

    if (message.error) {
      waiter.reject(
        new AcpReplyError(message.error.code, message.error.message, message.error.data),
      )
    } else waiter.resolve(message.result)
  }

  /** Запрос агента: обработчик сессии отвечает, когда решит человек; незнакомый - отказ. */
  private answer(id: RpcId, method: string, params: unknown, events: AcpProcessEvents) {
    events.onRequest(method, params).then(
      (result) => this.write(responseLine(id, { result: result ?? {} }, 'jsonrpc2')),
      (error: unknown) => {
        const code = error instanceof AcpReplyError ? error.code : ACP_METHOD_NOT_FOUND
        const text = error instanceof Error ? error.message : `Unsupported request: ${method}`

        this.write(responseLine(id, { error: { code, message: text } }, 'jsonrpc2'))
      },
    )
  }

  private write(line: string) {
    if (!this.exited) this.child.stdin.write(line)
  }
}

/**
 * Текст сбоя для ленты: сообщение JSON-RPC и подробности из `data` - у «Internal error» причина
 * (отказ Google, квота) лежит только там.
 */
export const errorTextOf = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error)
  if (!(error instanceof AcpReplyError)) return error.message

  const { data } = error
  const fields =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null
  const detail =
    typeof data === 'string'
      ? data
      : [fields?.['details'], fields?.['message'], fields?.['error']].find(
          (one): one is string => typeof one === 'string' && one !== '',
        )

  return detail && !error.message.includes(detail) ? `${error.message}: ${detail}` : error.message
}

/** Агент отказал, потому что в него не вошли (`-32000` «Authentication required»). */
export const isAuthError = (error: unknown): boolean =>
  error instanceof AcpReplyError &&
  (error.code === ACP_AUTH_REQUIRED || /authentication required/i.test(error.message))

/** Отказ на запрос агента, которого клиент не умеет (`fs/*`, `terminal/*`). */
export const unsupported = (method: string): Promise<never> =>
  Promise.reject(new AcpReplyError(ACP_METHOD_NOT_FOUND, `Unsupported request: ${method}`))
