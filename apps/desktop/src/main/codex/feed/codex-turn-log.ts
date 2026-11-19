/** Ход разговора и сообщение человека, которым он начат ('' - ход начал сам Codex). */
export type CodexTurnEntry = { turnId: string; messageId: string }

/**
 * Ходы разговора по порядку - для форка и отката: окно называет сообщение, а Codex режет по
 * ходам (`thread/fork` с lastTurnId, `thread/revert` с beforeTurnId). Ранние ходы приходят
 * страницами истории, поздние - по ходу живого разговора.
 */
export class CodexTurnLog {
  private entries: CodexTurnEntry[] = []

  /** Последний законченный ход: идущий в форк не берётся (Codex его не отдаёт). */
  lastSettled(isRunning: boolean): string | null {
    return this.entries.at(isRunning ? -2 : -1)?.turnId ?? null
  }

  /** Страница истории (от старого к новому) - перед уже известными. */
  prepend(entries: readonly CodexTurnEntry[]): void {
    const known = new Set(this.entries.map((entry) => entry.turnId))

    this.entries = [...entries.filter((entry) => !known.has(entry.turnId)), ...this.entries]
  }

  add(entry: CodexTurnEntry): void {
    if (!this.entries.some((known) => known.turnId === entry.turnId)) this.entries.push(entry)
  }

  /** Ход, начатый сообщением; null - сообщение не начинало ход (или неизвестно). */
  turnOf(messageId: string): string | null {
    return this.entries.find((entry) => entry.messageId === messageId)?.turnId ?? null
  }

  /**
   * Последний ход перед тем, что начат сообщением: по него включительно идёт форк «до
   * сообщения». null - сообщение начало первый ход; undefined - такого сообщения нет.
   */
  turnBefore(messageId: string): string | null | undefined {
    const index = this.entries.findIndex((entry) => entry.messageId === messageId)

    if (index < 0) return undefined

    return this.entries[index - 1]?.turnId ?? null
  }

  /** Откат: ход, начатый сообщением, и всё после него - больше не в разговоре. */
  truncateFrom(messageId: string): void {
    const index = this.entries.findIndex((entry) => entry.messageId === messageId)

    if (index >= 0) this.entries = this.entries.slice(0, index)
  }
}
