import type { SoundEvent, ConversationCall } from '@shared/claude-prefs'

import { strongestCall } from './call-reasons'
import { CALL_SETTLE_MS } from './calls.constants'

/**
 * Поводы позвать человека по вкладкам: за короткий такт собираются, и вкладка зовёт
 * одним, самым важным (SOUND_PRIORITY). Выключенный в Settings → Sound alerts повод не
 * зовёт вовсе - ни звуком, ни свечением вкладки: светится только то, что прозвучало бы.
 * Звук играет окно, оно же решает, слышен ли он подряд за другим.
 */
export class ConversationCalls {
  private readonly gathered = new Map<string, Set<SoundEvent>>()
  /** Последний ключ повторяющегося повода по вкладке: лимит того же окна зовёт раз. */
  private readonly lastKeys = new Map<string, string>()
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly mutedSounds: () => readonly SoundEvent[],
    private readonly emit: (call: ConversationCall) => void,
    /**
     * Каждый повод - и выключенный в звуках: телефону (Remote Control) звонят не звуком
     * стола, и тишина за столом не должна глушить его уведомления.
     */
    private readonly observe: (call: ConversationCall) => void = () => undefined,
  ) {}

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
    const muted = this.mutedSounds()

    this.timer = null

    for (const [conversationId, reasons] of this.gathered) {
      const reason = strongestCall(reasons)

      if (!reason) continue

      this.observe({ conversationId, reason })

      if (!muted.includes(reason)) this.emit({ conversationId, reason })
    }

    this.gathered.clear()
  }
}
