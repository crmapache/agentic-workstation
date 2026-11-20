import { utilityProcess } from 'electron'
import type { UtilityProcess } from 'electron'

import type { EditorServiceState } from '@shared/memory-saver'

import {
  DEFINITION_STOP_MS,
  DEFINITION_REQUEST_MS,
  DEFINITION_KILL_GRACE_MS,
} from './definition.constants'
import type { JobAnswer, DefinitionJob, WorkerInbound, WorkerOutbound } from './definition.types'
import { awaitDefinitionExit, stopDefinitionProcess } from './stop-definition-process'

type Waiting = {
  resolve: (answer: JobAnswer) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

/** Связь с процессом определений: вопрос - ответ. */
export type DefinitionAsk = {
  request: (job: DefinitionJob) => Promise<JobAnswer>
}

/**
 * Компилятор и кеши живут в отдельном процессе и освобождаются вместе с ним (ADR 0061).
 * Запуск разрешается только после чтения режима экономии; остановка подтверждается exit.
 * Пока старый процесс не вышел, новый не создаётся, даже если остановка дала ошибку.
 */
export class DefinitionLink implements DefinitionAsk {
  private child: UtilityProcess | null = null
  private readonly waiting = new Map<number, Waiting>()
  private idle: NodeJS.Timeout | null = null
  private stopping: Promise<void> | null = null
  private suspended = true
  private closed = false
  private nextId = 1
  private current: EditorServiceState = { phase: 'idle', pid: null, failure: null }
  private readonly watchers = new Set<() => void>()

  constructor(
    private readonly modulePath: string,
    private readonly idleMs: number,
  ) {}

  get state(): EditorServiceState {
    return { ...this.current, pid: this.child?.pid ?? null }
  }

  /**
   * Новый процесс нельзя: экономия памяти или выход IDE, либо прежний процесс не вышел после
   * неудачной остановки и всё ещё наш. Единственное место этого условия.
   */
  private get blocked(): boolean {
    return this.suspended || this.current.failure === 'stop'
  }

  /** Запрет встаёт синхронно, раньше ожидания выхода и любых новых запросов из окон. */
  setSuspended(suspended: boolean): Promise<void> {
    this.suspended = suspended || this.closed
    if (this.blocked || this.stopping) return this.stop()

    this.changed(this.child ? 'running' : 'idle')

    return Promise.resolve()
  }

  /** Подписка на смену состояния процесса; ответ - отписка. */
  watch(listener: () => void): () => void {
    this.watchers.add(listener)

    return () => void this.watchers.delete(listener)
  }

  /** Выход IDE: запуск запрещён навсегда, что бы ни осталось в очереди переключений. */
  close(): Promise<void> {
    this.closed = true

    return this.setSuspended(true)
  }

  request = async (job: DefinitionJob): Promise<JobAnswer> => {
    // Остановка по простою или после сбоя: вопрос ждёт выхода старого процесса и поднимает новый.
    if (this.stopping && !this.blocked) await this.stopping.catch(() => undefined)
    if (this.blocked || this.stopping) return { kind: 'none' }

    return this.ask(job)
  }

  private ask(job: DefinitionJob): Promise<JobAnswer> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      const message: WorkerInbound = { id, job }
      const timer = setTimeout(
        () => void this.stop('request').catch(() => undefined),
        DEFINITION_REQUEST_MS,
      )

      this.waiting.set(id, { resolve, reject, timer })

      try {
        this.spawned().postMessage(message)
        this.restartIdle()
      } catch (error) {
        this.failAll(error instanceof Error ? error : new Error(String(error)))
        if (this.child) void this.stop('start').catch(() => undefined)
        else this.changed('error', 'start')
      }
    })
  }

  private spawned(): UtilityProcess {
    if (this.child) return this.child

    this.changed('starting')
    const child = utilityProcess.fork(this.modulePath, [], {
      serviceName: 'Agentic Workstation Definitions',
      stdio: 'ignore',
    })

    // Запустился ли процесс: выход до spawn - сбой запуска, после - падение работавшего.
    let started = false

    this.child = child
    child.on('spawn', () => {
      started = true
      if (this.child !== child || this.stopping) return
      if (this.blocked) void this.stop().catch(() => undefined)
      else this.changed('running')
    })
    child.on('message', (message: WorkerOutbound) => {
      if (this.child === child && !this.stopping) this.receive(message)
    })
    child.on('error', (type, location) => {
      if (this.child !== child) return

      console.warn('[definitions] process failed', type, location)
      this.failAll(new Error(`definitions failed: ${type} ${location}`))
      // Electron сам завершает процесс и обязательно присылает exit. Сигнал умирающему не нужен,
      // а его отказ выдал бы падение за неудачную остановку.
      if (!this.stopping) {
        void this.leave(
          started ? 'crash' : 'start',
          awaitDefinitionExit(child, DEFINITION_STOP_MS),
        ).catch(() => undefined)
      }
    })
    child.on('exit', (code) => this.lost(child, code, started))

    return child
  }

  private restartIdle() {
    this.clearIdle()
    this.idle = setTimeout(() => {
      if (this.waiting.size > 0) this.restartIdle()
      else void this.stop().catch(() => undefined)
    }, this.idleMs)
    this.idle.unref()
  }

  private clearIdle() {
    if (this.idle) clearTimeout(this.idle)
    this.idle = null
  }

  private stop(failure: EditorServiceState['failure'] = null): Promise<void> {
    this.clearIdle()
    this.failAll(new Error('definitions stopped'))
    if (this.stopping) return this.stopping

    const child = this.child

    if (!child) {
      this.settle(failure)

      return Promise.resolve()
    }

    return this.leave(
      failure,
      stopDefinitionProcess(child, DEFINITION_KILL_GRACE_MS, DEFINITION_STOP_MS),
    )
  }

  /** Старый процесс уходит: новый не создаётся, пока не пришёл его exit. */
  private leave(failure: EditorServiceState['failure'], exit: Promise<void>): Promise<void> {
    this.changed('stopping', failure)
    const operation = exit
      .then(() => this.settle(failure))
      .catch((error: unknown) => {
        console.warn('[definitions] stop failed', error)
        this.changed('error', 'stop')
        throw error
      })
      .finally(() => {
        this.stopping = null
      })

    this.stopping = operation

    return operation
  }

  /**
   * Итог остановки - по тому, что нужно сейчас, а не тому, кто её начал: при экономии памяти выход
   * процесса - успех, даже если остановку начал зависший запрос.
   */
  private settle(failure: EditorServiceState['failure']) {
    if (this.suspended || !failure) this.changed('idle')
    else this.changed('error', failure)
  }

  private receive(message: WorkerOutbound) {
    const waiting = this.waiting.get(message.id)

    this.waiting.delete(message.id)
    if (!waiting) return

    clearTimeout(waiting.timer)
    if (message.ok) {
      this.changed('running')
      waiting.resolve(message.answer)
    } else {
      this.changed('error', 'request')
      waiting.reject(new Error(message.error))
    }
  }

  private lost(child: UtilityProcess, code: number, started: boolean) {
    if (this.child !== child) return

    this.child = null
    this.clearIdle()
    this.failAll(new Error(`definitions exited: ${code}`))
    // Выход, которого ждали, оформляет итог ожидания (settle).
    if (this.stopping) return
    // Запоздалый exit после таймаута остановки: теперь память точно отдана.
    if (this.current.failure === 'stop') return this.changed('idle')

    // В окно уходит только причина, код выхода - сюда: иначе тихое падение не с чем разбирать.
    console.warn('[definitions] process exited unexpectedly', code)
    this.changed('error', started ? 'crash' : 'start')
  }

  private failAll(error: Error) {
    for (const waiting of this.waiting.values()) {
      clearTimeout(waiting.timer)
      waiting.reject(error)
    }

    this.waiting.clear()
  }

  private changed(
    phase: EditorServiceState['phase'],
    failure: EditorServiceState['failure'] = null,
  ) {
    const pid = this.child?.pid ?? null
    const { current } = this

    // Ответ за ответом при наведении с ⌘ состояния не меняет: окнам нечего перерисовывать.
    if (current.phase === phase && current.failure === failure && current.pid === pid) return

    this.current = { phase, failure, pid }
    for (const watcher of this.watchers) watcher()
  }
}
