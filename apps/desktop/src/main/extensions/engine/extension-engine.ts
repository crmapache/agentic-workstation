import { Worker } from 'node:worker_threads'

import type { ExtensionProblem, ExtensionLogEntry } from '@shared/extensions'

import type { ToEngine, FromEngine } from './engine-protocol'
import type { SandboxSpec } from './sandbox'
import { SandboxPool } from './sandbox-pool'
import type { SandboxLimits } from './sandbox.constants'

/** Что движку нужно от IDE: исполнить вызов расширения, записать журнал, узнать о поломке. */
export type EngineEvents = {
  /** Вызов `ide.*`: значение - ответ, исключение - ошибка внутри расширения его словами. */
  host: (id: string, method: string, args: unknown) => Promise<unknown>
  log: (id: string, level: ExtensionLogEntry['level'], text: string) => void
  /** Песочница сломалась сама (таймер ушёл за срок, поток упал): расширение не работает. */
  broke: (id: string, problem: ExtensionProblem) => void
}

/** Отказ движка с причиной для человека: не загрузилось, вышел срок, память, поток упал. */
export class EngineFailure extends Error {
  constructor(readonly problem: ExtensionProblem) {
    super(problem.detail)
  }
}

/** Канал до песочниц: поток worker_threads или пул в этом же процессе. */
export type EnginePort = { post: (message: ToEngine) => void; close: () => Promise<void> }

export type PortFactory = (
  receive: (message: FromEngine) => void,
  lost: (error: Error) => void,
) => EnginePort

type Waiting = { resolve: (value: unknown) => void; reject: (error: Error) => void }

/**
 * Движок расширений в главном процессе (ADR 0091): поднимает поток песочниц на первом запуске,
 * ждёт ответы по номерам, отвечает песочницам на вызовы IDE. Поток упал - каждое запущенное
 * расширение получает причину engine, следующий запуск поднимает поток заново.
 */
export class ExtensionEngine {
  private port: EnginePort | null = null
  private readonly waiting = new Map<number, Waiting>()
  private readonly running = new Set<string>()
  private nextCall = 1

  constructor(
    private readonly factory: PortFactory,
    private readonly events: EngineEvents,
  ) {}

  async start(spec: SandboxSpec): Promise<void> {
    await this.request((callId) => ({ type: 'start', callId, spec }))
    this.running.add(spec.id)
  }

  async stop(id: string): Promise<void> {
    this.running.delete(id)

    if (this.port) await this.request((callId) => ({ type: 'stop', callId, id }))
  }

  dispatch(id: string, handler: number, args: readonly unknown[]): Promise<unknown> {
    return this.request((callId) => ({ type: 'dispatch', callId, id, handler, args: [...args] }))
  }

  forget(id: string, handler: number): void {
    this.port?.post({ type: 'forget', id, handler })
  }

  async close(): Promise<void> {
    const port = this.port

    this.port = null
    this.running.clear()
    this.failAll(new Error('The extensions engine closed.'))
    await port?.close()
  }

  private request(message: (callId: number) => ToEngine): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const callId = this.nextCall++

      this.waiting.set(callId, { resolve, reject })
      this.opened().post(message(callId))
    })
  }

  private opened(): EnginePort {
    if (this.port) return this.port

    const port = this.factory(
      (message) => this.receive(message),
      (error) => this.lost(port, error),
    )

    this.port = port

    return port
  }

  private receive(message: FromEngine) {
    switch (message.type) {
      case 'done': {
        const waiting = this.waiting.get(message.callId)

        this.waiting.delete(message.callId)

        if (!waiting) return
        if (message.ok) return waiting.resolve(message.value)

        return waiting.reject(
          message.problem ? new EngineFailure(message.problem) : new Error(message.error),
        )
      }
      case 'host':
        return void this.answerHost(message)
      case 'log':
        return this.events.log(message.id, message.level, message.text)
      case 'broke':
        this.running.delete(message.id)

        return this.events.broke(message.id, message.problem)
    }
  }

  private async answerHost(message: Extract<FromEngine, { type: 'host' }>) {
    let raw: string

    try {
      const value = await this.events.host(message.id, message.method, JSON.parse(message.payload))

      raw = JSON.stringify({ ok: true, value: value ?? null })
    } catch (error) {
      raw = JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    this.port?.post({ type: 'hostAnswer', hostCallId: message.hostCallId, raw })
  }

  private lost(port: EnginePort, error: Error) {
    if (this.port !== port) return

    console.warn('[extensions] поток песочниц упал', error)
    this.port = null
    this.failAll(error)

    const problem: ExtensionProblem = { code: 'engine', detail: error.message }

    for (const id of this.running) this.events.broke(id, problem)

    this.running.clear()
  }

  private failAll(error: Error) {
    for (const waiting of this.waiting.values()) waiting.reject(error)

    this.waiting.clear()
  }
}

/** Песочницы в своём потоке: так в IDE. */
export const workerPort =
  (workerPath: string): PortFactory =>
  (receive, lost) => {
    const worker = new Worker(workerPath)

    worker.on('message', receive)
    worker.on('error', (error: unknown) =>
      lost(error instanceof Error ? error : new Error(String(error))),
    )
    worker.on('exit', (code) => lost(new Error(`The extensions engine exited: ${code}`)))
    // Поток не держит процесс: выход IDE не ждёт расширений.
    worker.unref()

    return {
      post: (message) => worker.postMessage(message),
      close: async () => {
        worker.removeAllListeners('exit')
        await worker.terminate()
      },
    }
  }

/** Песочницы в этом же процессе - для проверок: сообщения те же, с копией через structuredClone. */
export const inlinePort =
  (limits?: SandboxLimits): PortFactory =>
  (receive) => {
    let open = true
    const pool = new SandboxPool((message) => {
      if (open) setImmediate(() => receive(structuredClone(message)))
    }, limits)

    return {
      post: (message) => setImmediate(() => pool.receive(structuredClone(message))),
      close: () => {
        open = false

        return Promise.resolve()
      },
    }
  }
