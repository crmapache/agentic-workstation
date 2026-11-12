import type { ConversationCall } from '@shared/claude-prefs'
import type { SoundEvent } from '@shared/sounds'

import { strongestCall } from './call-reasons'
import { CALL_SETTLE_MS } from './calls.constants'

/**
 * Поводы позвать человека по вкладкам: за короткий такт собираются, и вкладка зовёт
 * одним, самым важным (SOUND_PRIORITY). Зовёт каждым поводом: глушить выключенные в
 * Settings → Sounds - дело IDE (main/sounds), а телефон (Remote Control) слышит и их - ему
 * звонят не звуком стола. Звук играет окно, оно же решает, слышен ли он подряд за другим.
 */
export class ConversationCalls {
  private readonly gathered = new Map<string, Set<SoundEvent>>()
  /** Последний ключ повторяющегося повода по вкладке: лимит того же окна зовёт раз. */
  private readonly lastKeys = new Map<string, string>()
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly emit: (call: ConversationCall) => void) {}

  add(conversationId: string, reason: SoundEvent, key?: string): void {
    if (key !== undefined) {
      if (this.lastKeys.get(conversationId) === key) return

      this.lastKeys.set(conversationId, key)
    }

    const reasons = this.gathered.get(conversationId) ?? new Set<SoundEvent>()

    reasons.add(reason)
    this.gathered.set(conversationId, reasons)
    this.timer ??= setTimeout(() => this.flush(), CALL_SETTLE_MS)
  }

  private flush() {
    this.timer = null

    for (const [conversationId, reasons] of this.gathered) {
      const reason = strongestCall(reasons)

      if (reason) this.emit({ conversationId, reason })
    }

    this.gathered.clear()
  }
}
