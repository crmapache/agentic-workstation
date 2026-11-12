import type { RemoteErrorCode } from '@agentic-workstation/remote-protocol/agent-messages'

/** Исход команды: данные для телефона или отказ кодом (detail - слово самой IDE). */
export type Outcome =
  { ok: true; data?: unknown } | { ok: false; code: RemoteErrorCode; detail?: string }

/** Сколько помнить команду: ответ мог потеряться, а телефон повторяет её, пока не услышит итог. */
export const KEPT_MS = 10 * 60_000

/** И сколько команд на телефон: пределы частоты дают за десять минут больше, но старое не нужно. */
export const MAX_KEPT = 256

/**
 * Команда принята: итог есть или ещё выполняется (null). at - когда принята, а с итогом - когда
 * он готов: срок памяти считается от итога, и долгая команда (вопрос сбоку до 11 минут) не
 * забывается, пока идёт, и ещё KEPT_MS после.
 */
export type Entry = { at: number; outcome: Outcome | null }

/** Протухла ли запись: выполняющаяся - никогда, с итогом - через KEPT_MS после него. */
const stale = (entry: Entry, now: number) => entry.outcome !== null && now - entry.at > KEPT_MS

/**
 * Журнал команд телефона по их id. Телефон повторяет команду, если не услышал ответ (обрыв,
 * сон, протухший ящик релея), - и повтор не должен выполниться второй раз: второе сообщение в
 * разговор, второй запуск сценария. Повтор получает сохранённый итог; пока первая ещё
 * выполняется, итог придёт один раз, когда будет готов.
 */
export class CommandLedger {
  private readonly phones = new Map<string, Map<string, Entry>>()

  constructor(private readonly clock: () => number = Date.now) {}

  /** Уже принята ли команда с этим id; протухшее не считается. */
  seen(deviceId: string, commandId: string): Entry | null {
    const entries = this.phones.get(deviceId)
    const entry = entries?.get(commandId)

    if (!entries || !entry) return null
    if (!stale(entry, this.clock())) return entry

    entries.delete(commandId)

    return null
  }

  /** Команда принята - до того, как начнёт выполняться: повтор в очереди её уже видит. */
  begin(deviceId: string, commandId: string): void {
    const entries = this.phones.get(deviceId) ?? new Map<string, Entry>()

    entries.set(commandId, { at: this.clock(), outcome: null })

    while (entries.size > MAX_KEPT) {
      const oldest = entries.keys().next().value

      if (oldest === undefined) break

      entries.delete(oldest)
    }

    this.phones.set(deviceId, entries)
  }

  settle(deviceId: string, commandId: string, outcome: Outcome): void {
    const entry = this.phones.get(deviceId)?.get(commandId)

    if (!entry) return

    entry.outcome = outcome
    entry.at = this.clock()
  }

  /** Протухшее - вон: зовётся сердцебиением линии. */
  sweep(): void {
    const now = this.clock()

    for (const [deviceId, entries] of this.phones) {
      for (const [commandId, entry] of entries) {
        if (stale(entry, now)) entries.delete(commandId)
      }

      if (entries.size === 0) this.phones.delete(deviceId)
    }
  }

  forget(deviceId: string): void {
    this.phones.delete(deviceId)
  }
}
