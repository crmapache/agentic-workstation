import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'
import type { PushSubscriptionWire } from '@agentic-workstation/remote-protocol/push'

/**
 * Подписка телефона на пуши - каждой спаренной IDE: тем, с кем линия открыта, сразу, а
 * остальным - на их следующей линии. На каждой новой линии - заново: подписку, которую IDE
 * потеряла (служба сказала «нет такой») или ещё не знает (пара свежая), так она получает сама.
 * Пока телефон не знает, что с уведомлениями (undefined), IDE ничего не говорится.
 */
export class PushSync {
  private wanted: PushSubscriptionWire | null | undefined = undefined

  constructor(
    private readonly send: (agentId: string, message: object) => void,
    private readonly openMachines: () => string[],
  ) {}

  set(subscription: PushSubscriptionWire | null): void {
    this.wanted = subscription

    for (const agentId of this.openMachines()) this.tell(agentId)
  }

  /** Линия с IDE открылась (после hello). */
  opened(agentId: string): void {
    this.tell(agentId)
  }

  private tell(agentId: string) {
    if (this.wanted === undefined) return

    this.send(
      agentId,
      this.wanted
        ? { p: PROTOCOL_VERSION, k: 'pushSet', ...this.wanted }
        : { p: PROTOCOL_VERSION, k: 'pushClear' },
    )
  }
}
