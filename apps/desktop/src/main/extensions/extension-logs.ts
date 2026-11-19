import type { ExtensionLogEntry } from '@shared/extensions'

/** Сколько записей журнала держится на расширение и сколько знаков в записи. */
const LOG_LIMIT = 300
const ENTRY_MAX = 4000
/** Окну журнал едет пачками не чаще этого: console.log в цикле не заваливает IPC. */
const FLUSH_MS = 150

/**
 * Журнал расширений в памяти: console.* из песочницы и слова движка (запуск, остановка, сбой).
 * Новое уходит окну пачкой; ошибки считаются с последнего запуска - число на карточке.
 */
export class ExtensionLogs {
  private readonly entries = new Map<string, ExtensionLogEntry[]>()
  private readonly errors = new Map<string, number>()
  private readonly pending = new Map<string, ExtensionLogEntry[]>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly onFlush: (id: string, entries: ExtensionLogEntry[]) => void,
    private readonly now: () => number = Date.now,
  ) {}

  add(id: string, level: ExtensionLogEntry['level'], text: string): void {
    const entry = {
      at: this.now(),
      level,
      text: text.length > ENTRY_MAX ? `${text.slice(0, ENTRY_MAX)}…` : text,
    }
    const list = [...(this.entries.get(id) ?? []), entry].slice(-LOG_LIMIT)

    this.entries.set(id, list)
    this.pending.set(id, [...(this.pending.get(id) ?? []), entry])

    if (level === 'error') this.errors.set(id, (this.errors.get(id) ?? 0) + 1)

    this.timer ??= setTimeout(() => this.flush(), FLUSH_MS)
  }

  list(id: string): ExtensionLogEntry[] {
    return this.entries.get(id) ?? []
  }

  errorCount(id: string): number {
    return this.errors.get(id) ?? 0
  }

  /** Новый запуск - счёт ошибок с нуля; сам журнал остаётся: в нём причина прошлого сбоя. */
  restarted(id: string): void {
    this.errors.delete(id)
  }

  clear(id: string): void {
    this.entries.delete(id)
    this.errors.delete(id)
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)

    this.timer = null
  }

  private flush() {
    this.timer = null

    for (const [id, entries] of this.pending) this.onFlush(id, entries)

    this.pending.clear()
  }
}
