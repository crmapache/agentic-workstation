import type { CalendarSource, CalendarFailure } from '@shared/calendar'
import { isAiSourceKind } from '@shared/calendar'
import { MINUTE_MS, SECOND_MS } from '@shared/time-units'

import type { CalendarService } from './calendar-service'
import type { SourceResult } from './calendar-snapshot'
import type { SyncWindow } from './calendar-window'
import { directWindow } from './calendar-window'

/** Прямые источники обновляются сами так часто: звонок, поставленный утром, виден к обеду. */
const DIRECT_EVERY_MS = 15 * MINUTE_MS

/** Открытие вида перечитывает прямой источник, прочитанный раньше этого. */
const STALE_ON_VIEW_MS = 5 * MINUTE_MS

/** После сна сеть поднимается не сразу: синк - с паузой. */
const AFTER_WAKE_MS = 30 * SECOND_MS

export type AiSource = Extract<CalendarSource, { kind: 'ai-browser' | 'ai-screen' }>

/** Кто читает источники: прямые - сама IDE, остальные - ИИ (calendar-ai-run.ts). */
export type SourceReaders = {
  direct: (source: CalendarSource, window: SyncWindow, signal: AbortSignal) => Promise<SourceResult>
  ai: (source: AiSource, signal: AbortSignal) => Promise<SourceResult>
}

const isAi = (source: CalendarSource): source is AiSource => isAiSourceKind(source.kind)

/** Читатель упал там, где не ждали: источник встаёт с причиной, а не висит «идёт». */
const unexpected =
  (failure: CalendarFailure) =>
  (error: unknown): SourceResult => {
    console.warn('[calendar] источник не прочитался', error)

    return { ok: false, failure }
  }

/**
 * Движок синка календаря (ADR 0114). Прямые источники читаются параллельно и сами: по таймеру,
 * при открытии вида и после сна. ИИ-источники - только по просьбе (кнопка, инструмент), строго
 * по одному: Chrome человека и его мышь общие на все. Источник, который уже читается, второй
 * раз не встаёт.
 */
export class CalendarSync {
  private readonly running = new Map<string, AbortController>()
  private readonly aiQueue: string[] = []
  private aiBusy = false
  private timer: ReturnType<typeof setInterval> | null = null
  private wake: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly service: CalendarService,
    private readonly readers: SourceReaders,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Таймер прямых источников и первое чтение тех, что давно не читались. */
  start(): void {
    this.timer = setInterval(() => this.syncDirect(0), DIRECT_EVERY_MS)
    this.timer.unref()
    this.syncDirect(STALE_ON_VIEW_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.wake) clearTimeout(this.wake)

    this.cancel(null)
  }

  /** Синк источника или всех; withAi - и тех, что читает ИИ. */
  sync(sourceId: string | null, withAi: boolean): void {
    for (const source of this.service.sources) {
      if (sourceId !== null && source.id !== sourceId) continue
      if (isAi(source)) {
        if (withAi || sourceId !== null) this.enqueueAi(source)
      } else {
        void this.runDirect(source)
      }
    }
  }

  /**
   * Синк по просьбе ИИ из разговора: прямые источники, с withAi - и браузерные; по экрану -
   * никогда, он забирает мышь человека. Ответ - сколько источников встало.
   */
  syncFromAi(withAi: boolean): number {
    let started = 0

    for (const source of this.service.sources) {
      if (!isAi(source)) {
        void this.runDirect(source)
        started += 1
      } else if (withAi && source.kind === 'ai-browser') {
        this.enqueueAi(source)
        started += 1
      }
    }

    return started
  }

  /** Остановить синк источника или всех: очередь ИИ пустеет, идущие гаснут. */
  cancel(sourceId: string | null): void {
    for (let index = this.aiQueue.length - 1; index >= 0; index -= 1) {
      const id = this.aiQueue[index]

      if (id !== undefined && (sourceId === null || id === sourceId)) {
        this.aiQueue.splice(index, 1)
        this.service.setPhase(id, null)
      }
    }

    for (const [id, controller] of this.running) {
      if (sourceId === null || id === sourceId) controller.abort()
    }
  }

  /** Вид открыли: прямые источники, прочитанные давно, - заново. */
  viewed(): void {
    this.syncDirect(STALE_ON_VIEW_MS)
  }

  /** Компьютер проснулся: прямые источники - после паузы на сеть. */
  resumed(): void {
    if (this.wake) clearTimeout(this.wake)

    this.wake = setTimeout(() => this.syncDirect(0), AFTER_WAKE_MS)
  }

  /** Прямые источники, прочитанные раньше чем staleMs назад (0 - все). */
  private syncDirect(staleMs: number): void {
    const now = this.now()

    for (const source of this.service.sources) {
      const lastOk = this.service.lastOkAt(source.id)

      if (!isAi(source) && (staleMs === 0 || lastOk === null || now - lastOk > staleMs)) {
        void this.runDirect(source)
      }
    }
  }

  private async runDirect(source: CalendarSource): Promise<void> {
    if (this.running.has(source.id)) return

    const controller = new AbortController()

    this.running.set(source.id, controller)
    this.service.setPhase(source.id, 'running')

    try {
      const result = await this.readers
        .direct(source, directWindow(this.now()), controller.signal)
        .catch(unexpected('network'))

      await this.service.applyRead(source.id, result)
    } finally {
      this.running.delete(source.id)
    }
  }

  private enqueueAi(source: AiSource): void {
    if (this.running.has(source.id) || this.aiQueue.includes(source.id)) return

    this.aiQueue.push(source.id)
    this.service.setPhase(source.id, 'queued')
    void this.pumpAi()
  }

  /** Следующий из очереди ИИ, если слот свободен. */
  private async pumpAi(): Promise<void> {
    if (this.aiBusy) return

    const id = this.aiQueue.shift()
    const source = id === undefined ? null : this.service.source(id)

    if (!source || !isAi(source)) {
      if (this.aiQueue.length) void this.pumpAi()

      return
    }

    const controller = new AbortController()

    this.aiBusy = true
    this.running.set(source.id, controller)
    this.service.setPhase(source.id, 'running')

    try {
      const result = await this.readers.ai(source, controller.signal).catch(unexpected('ai-failed'))

      await this.service.applyRead(source.id, result)
    } finally {
      this.running.delete(source.id)
      this.aiBusy = false
      void this.pumpAi()
    }
  }
}
