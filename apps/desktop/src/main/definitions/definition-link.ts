import { utilityProcess } from 'electron'
import type { UtilityProcess } from 'electron'

import type { JobAnswer, DefinitionJob, WorkerInbound, WorkerOutbound } from './definition.types'

type Waiting = { resolve: (answer: JobAnswer) => void; reject: (error: Error) => void }

/** Связь с процессом определений: вопрос - ответ. */
export type DefinitionAsk = {
  request: (job: DefinitionJob) => Promise<JobAnswer>
  close: () => Promise<void>
}

/**
 * Процесс определений поднимается первым вопросом, а не со стартом IDE, и завершается после
 * простоя idleMs: компилятор TypeScript нужен, только пока человек ходит по коду с ⌘, и
 * постоянной нагрузки фича не даёт. Отдельный процесс, а не поток: поток в главном процессе
 * после выгрузки оставлял там 70-110 МБ (ADR 0061), а завершённый процесс отдаёт системе всё.
 * Процесс упал - ждущие вопросы получают ошибку, следующий поднимает его заново.
 */
export class DefinitionLink implements DefinitionAsk {
  private child: UtilityProcess | null = null
  private readonly waiting = new Map<number, Waiting>()
  private idle: NodeJS.Timeout | null = null
  private nextId = 1

  constructor(
    private readonly modulePath: string,
    private readonly idleMs: number,
  ) {}

  request = (job: DefinitionJob): Promise<JobAnswer> =>
    new Promise((resolve, reject) => {
      const id = this.nextId++
      const message: WorkerInbound = { id, job }

      this.waiting.set(id, { resolve, reject })
      this.spawned().postMessage(message)
      this.restartIdle()
    })

  close = (): Promise<void> => {
    if (this.idle) clearTimeout(this.idle)

    this.retire(new Error('definitions closed'))

    return Promise.resolve()
  }

  private spawned(): UtilityProcess {
    if (this.child) return this.child

    const child = utilityProcess.fork(this.modulePath, [], {
      serviceName: 'Agentic Workstation Definitions',
      stdio: 'ignore',
    })

    child.on('message', (message: WorkerOutbound) => this.receive(message))
    child.on('exit', (code) => this.lost(child, new Error(`definitions exited: ${code}`)))
    this.child = child

    return child
  }

  private restartIdle() {
    if (this.idle) clearTimeout(this.idle)

    this.idle = setTimeout(() => {
      if (this.waiting.size > 0) this.restartIdle()
      else this.retire(new Error('definitions idle'))
    }, this.idleMs)
    this.idle.unref()
  }

  /** Процесс завершается вместе с памятью компилятора и разобранных файлов. */
  private retire(error: Error) {
    const child = this.child

    this.child = null
    this.failAll(error)
    child?.kill()
  }

  private receive(message: WorkerOutbound) {
    const waiting = this.waiting.get(message.id)

    this.waiting.delete(message.id)

    if (!waiting) return
    if (message.ok) waiting.resolve(message.answer)
    else waiting.reject(new Error(message.error))
  }

  private lost(child: UtilityProcess, error: Error) {
    if (this.child !== child) return

    console.warn('[definitions] process ended', error)
    this.child = null
    this.failAll(error)
  }

  private failAll(error: Error) {
    for (const waiting of this.waiting.values()) waiting.reject(error)

    this.waiting.clear()
  }
}
