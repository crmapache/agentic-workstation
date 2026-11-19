import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'

import { SPAWN_DETACHED } from '../../platform'
import { ProcessGroup } from '../../process/process-group'
import type { Environment } from '../../process/shell-env'
import {
  SERVER_USER,
  EVENTS_RETRY_MS,
  START_TIMEOUT_MS,
  STDERR_TAIL_CHARS,
  REQUEST_TIMEOUT_MS,
  STDIN_CLOSE_GRACE_MS,
} from './opencode-server.constants'
import { SseLines } from './sse-lines'

/** Папки OpenCode у IDE: конфиг, база разговоров, состояние, кеш - свои, не человека. */
export type OpenCodeDirs = { config: string; data: string; state: string; cache: string }

export type OpenCodeSpawn = {
  binary: string
  /** Папка процесса - проект разговора: конфиг проекта OpenCode читает от неё. */
  cwd: string
  env: Environment
  dirs: OpenCodeDirs
  /** Конфиг OpenCode строкой JSON: подключения, модели, коннекторы, права. */
  config: string
}

/** Событие сервера (`GET /api/event`): вид, данные и папка, к которой оно относится. */
export type OpenCodeEvent = { type: string; data: Record<string, unknown>; directory: string }

export type OpenCodeServerEvents = {
  onEvent: (event: OpenCodeEvent) => void
  onExit: (code: number | null, stderrTail: string) => void
}

/** Ответ сервера с ошибкой: код HTTP, вид (`_tag`) и слова сервера. */
export class OpenCodeReplyError extends Error {
  constructor(
    readonly status: number,
    readonly tag: string,
    message: string,
  ) {
    super(message)
  }
}

/** Процесс кончился, ответа не будет. */
export class OpenCodeExitedError extends Error {
  constructor() {
    super('opencode serve exited')
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Запрос к серверу: тело - JSON, query - строки. */
export type OpenCodeRequest = {
  body?: unknown
  query?: Record<string, string>
  timeoutMs?: number
}

/**
 * Процесс `opencode serve --stdio` (ADR 0084, протокол - docs/plan-providers/40-open-models.md):
 * адрес - первой строкой stdout, запросы - HTTP с Basic и своим случайным паролем, события -
 * поток SSE, который переподключается, пока сервер жив. Гаснет закрытием stdin, как у Codex;
 * процесс - в группе процессов IDE: выход IDE его дождётся.
 */
export class OpenCodeServer {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly group: ProcessGroup
  private readonly password = randomBytes(24).toString('base64url')
  private readonly ready: Promise<string>
  private readonly events = new AbortController()
  private stderrTail = ''
  private exited = false

  constructor(spec: OpenCodeSpawn, handlers: OpenCodeServerEvents) {
    this.child = spawn(spec.binary, ['serve', '--stdio'], {
      cwd: spec.cwd,
      env: {
        ...spec.env,
        XDG_CONFIG_HOME: spec.dirs.config,
        XDG_DATA_HOME: spec.dirs.data,
        XDG_STATE_HOME: spec.dirs.state,
        XDG_CACHE_HOME: spec.dirs.cache,
        OPENCODE_SERVER_PASSWORD: this.password,
        OPENCODE_CONFIG_CONTENT: spec.config,
        OPENCODE_DISABLE_AUTOUPDATE: '1',
        // Бесплатные облачные модели OpenCode - чужой адрес: код проекта туда без спроса не идёт.
        OPENCODE_DISABLE_FREE_MODELS: '1',
      },
      detached: SPAWN_DETACHED,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    // OpenCode запускает команды агента каждую в своей группе: их гасит группа сама (spawnsGroups).
    this.group = new ProcessGroup(this.child, true)
    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-STDERR_TAIL_CHARS)
    })
    this.child.stdin.on('error', () => undefined)
    this.child.on('error', (error: Error) => {
      this.stderrTail = `${this.stderrTail}\n${error.message}`.slice(-STDERR_TAIL_CHARS)
    })
    this.child.on('close', (code) => {
      this.exited = true
      this.events.abort()
      handlers.onExit(code, this.stderrTail)
    })

    this.ready = this.start(handlers)
    // Не поднялся - запросы откажут сами, а процесс гасится: без адреса он бесполезен.
    this.ready.catch(() => void this.stop())
  }

  get isAlive(): boolean {
    return !this.exited && !this.group.isStopping
  }

  get isStopping(): boolean {
    return this.group.isStopping && !this.exited
  }

  /** Почему процесс кончился - хвост его stderr. */
  get errorTail(): string {
    return this.stderrTail
  }

  /**
   * Запрос, когда сервер готов: ответ - разобранный JSON (у большинства путей - `{data}`), ошибка
   * сервера - OpenCodeReplyError, выход процесса - OpenCodeExitedError.
   */
  async request(method: string, path: string, options: OpenCodeRequest = {}): Promise<unknown> {
    const base = await this.ready

    if (this.exited) throw new OpenCodeExitedError()

    const url = new URL(path, base)

    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value)
    }

    const response = await fetch(url, {
      method,
      headers: {
        authorization: this.authorization(),
        ...(options.body !== undefined && { 'content-type': 'application/json' }),
      },
      ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
    })
    const text = await response.text()
    const body: unknown = text ? JSON.parse(text) : null

    if (!response.ok) {
      const record = isRecord(body) ? body : {}
      const tag = typeof record['_tag'] === 'string' ? record['_tag'] : ''
      const message = typeof record['message'] === 'string' ? record['message'] : text

      throw new OpenCodeReplyError(response.status, tag, message || `HTTP ${response.status}`)
    }

    return body
  }

  /** Остановка: закрыть stdin - сервер выходит сам; не вышел за паузу - сигнал группе. */
  async stop(): Promise<void> {
    if (this.exited) return

    this.events.abort()
    // Группы команд агента - пока OpenCode жив: после его выхода их уже не найти.
    this.group.noteForeignGroups()
    this.child.stdin.end()

    await Promise.race([this.group.closed, delay(STDIN_CLOSE_GRACE_MS)])

    if (!this.exited) await this.group.stop()
  }

  kill(): void {
    this.group.kill()
  }

  private authorization(): string {
    return `Basic ${Buffer.from(`${SERVER_USER}:${this.password}`).toString('base64')}`
  }

  /** Адрес из первой строки stdout, потом поток событий; готов - когда поток открыт. */
  private async start(handlers: OpenCodeServerEvents): Promise<string> {
    const url = await this.address()
    let opened: () => void = () => undefined
    const connected = new Promise<void>((resolve) => (opened = resolve))

    void this.streamEvents(url, handlers, opened)
    await Promise.race([
      connected,
      delay(START_TIMEOUT_MS, undefined, { ref: false }).then(() => {
        throw new Error('opencode serve: поток событий не открылся')
      }),
    ])

    return url
  }

  private address(): Promise<string> {
    return new Promise((resolve, reject) => {
      const lines = createInterface({ input: this.child.stdout })
      const timer = setTimeout(() => {
        lines.close()
        reject(new Error('opencode serve: адрес не пришёл'))
      }, START_TIMEOUT_MS)

      timer.unref()
      this.child.once('close', () => {
        clearTimeout(timer)
        reject(new OpenCodeExitedError())
      })
      lines.on('line', (line) => {
        try {
          const parsed: unknown = JSON.parse(line)

          if (isRecord(parsed) && typeof parsed['url'] === 'string') {
            clearTimeout(timer)
            lines.close()
            resolve(parsed['url'])
          }
        } catch {
          // Не JSON - не адрес; ждём дальше.
        }
      })
    })
  }

  /** Поток событий, пока сервер жив: оборвался - снова через паузу. */
  private async streamEvents(base: string, handlers: OpenCodeServerEvents, opened: () => void) {
    while (!this.exited && !this.events.signal.aborted) {
      try {
        const response = await fetch(new URL('/api/event', base), {
          headers: { authorization: this.authorization(), accept: 'text/event-stream' },
          signal: this.events.signal,
        })

        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)

        opened()

        const lines = new SseLines()
        const decoder = new TextDecoder()
        // Тело ответа fetch в типах Node - поток без типа кусков; куски - байты.
        const reader = (response.body as ReadableStream<Uint8Array>).getReader()

        for (let part = await reader.read(); !part.done; part = await reader.read()) {
          for (const data of lines.push(decoder.decode(part.value, { stream: true }))) {
            this.dispatch(data, handlers)
          }
        }
      } catch (error) {
        if (this.events.signal.aborted) return

        console.warn('[opencode] поток событий оборвался, переподключение:', error)
      }

      await delay(EVENTS_RETRY_MS)
    }
  }

  private dispatch(data: string, handlers: OpenCodeServerEvents) {
    try {
      const parsed: unknown = JSON.parse(data)

      if (!isRecord(parsed) || typeof parsed['type'] !== 'string') return

      const location = isRecord(parsed['location']) ? parsed['location'] : {}

      handlers.onEvent({
        type: parsed['type'],
        data: isRecord(parsed['data']) ? parsed['data'] : {},
        directory: typeof location['directory'] === 'string' ? location['directory'] : '',
      })
    } catch (error) {
      // Сбой разбора или обработчика одного события не должен рвать поток.
      console.warn('[opencode] событие не обработалось:', error)
    }
  }
}

/** Данные ответа: у путей v2 ответ лежит в `data`, у некоторых - сам по себе. */
export const dataOf = (body: unknown): unknown =>
  isRecord(body) && 'data' in body ? body['data'] : body
