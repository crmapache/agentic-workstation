import { Worker } from 'node:worker_threads'

import type { StatsScanProgress } from '@shared/statistics'

import type { EngineLink, WorkerData, WorkerInbound, WorkerOutbound } from './engine-link'

type Waiting = { resolve: (value: unknown) => void; reject: (error: Error) => void }

/**
 * Движок в потоке worker_threads. Поток упал - ждущие запросы получают ошибку, а следующий
 * запрос поднимает поток заново: база в WAL переживает обрыв, проход продолжится со смещений.
 */
export class WorkerEngineLink implements EngineLink {
  private worker: Worker | null = null
  private readonly waiting = new Map<number, Waiting>()
  private nextId = 1

  constructor(
    private readonly workerPath: string,
    private readonly dbPath: string,
    private readonly onProgress: (progress: StatsScanProgress) => void,
  ) {}

  request: EngineLink['request'] = (request) =>
    new Promise((resolve, reject) => {
      const id = this.nextId++
      const message: WorkerInbound = { id, request }

      this.waiting.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.spawned().postMessage(message)
    })

  async close(): Promise<void> {
    const worker = this.worker

    this.worker = null
    this.failAll(new Error('statistics engine closed'))

    if (worker) await worker.terminate()
  }

  private spawned(): Worker {
    if (this.worker) return this.worker

    const workerData: WorkerData = { dbPath: this.dbPath }
    const worker = new Worker(this.workerPath, { workerData })

    worker.on('message', (message: WorkerOutbound) => this.receive(message))
    worker.on('error', (error: unknown) => {
      console.warn('[statistics] engine thread failed', error)
      this.lost(worker, error instanceof Error ? error : new Error(String(error)))
    })
    worker.on('exit', (code) => this.lost(worker, new Error(`statistics engine exited: ${code}`)))
    // Поток не держит процесс: выход IDE не ждёт идущего прохода.
    worker.unref()
    this.worker = worker

    return worker
  }

  private receive(message: WorkerOutbound) {
    if (message.type === 'progress') return this.onProgress(message.progress)

    const waiting = this.waiting.get(message.id)

    this.waiting.delete(message.id)

    if (!waiting) return
    if (message.ok) waiting.resolve(message.result)
    else waiting.reject(new Error(message.error))
  }

  private lost(worker: Worker, error: Error) {
    if (this.worker !== worker) return

    this.worker = null
    this.failAll(error)
  }

  private failAll(error: Error) {
    for (const waiting of this.waiting.values()) waiting.reject(error)

    this.waiting.clear()
  }
}
