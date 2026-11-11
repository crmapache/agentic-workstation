import type { NoticeCode, AgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { decodeBody } from '@agentic-workstation/remote-protocol/body'
import type {
  CmdMessage,
  PartMessage,
  PhoneMessage,
} from '@agentic-workstation/remote-protocol/phone-messages'
import {
  PROTOCOL_VERSION,
  parsePhoneMessage,
} from '@agentic-workstation/remote-protocol/phone-messages'

import type { Lane } from '../link/outbox'
import type { RemoteLimits } from './limits'
import { limitKindOf } from './limits'
import { RemoteParts, mayArriveInParts } from './parts'
import type { AgentHandlers } from './remote-agent'

export type InboundHost = {
  limits: RemoteLimits
  handlers: AgentHandlers
  reply: (deviceId: string, message: AgentMessage, lane?: Lane) => void
  /** Телефон сам просит его забыть: тот же отзыв, что из окна IDE. */
  unpair: (deviceId: string) => void
}

/** О скольких отброшенных сообщениях телефона помнить, что ему уже сказано. */
const NOTICED_KEPT = 32

/**
 * Открытые слова спаренного телефона - через пределы частоты и веса наверх. Ничто не теряется
 * молча: отброшенная команда получает итог rateLimited, отброшенный или пропавший кусок
 * сообщения - слово notice с id сообщения, и телефон кончает свою команду сразу. Стук (ping) и
 * «забудь меня» (unpair) решаются здесь: мосту до них дела нет.
 */
export class Inbound {
  private readonly parts = new RemoteParts()
  /** Сообщения частями, о которых телефону уже сказано: одно слово на сообщение, а не на кусок. */
  private readonly noticed = new Map<string, string[]>()

  constructor(private readonly host: InboundHost) {}

  /** Открытое тело кадра телефона. */
  take(deviceId: string, bytes: Uint8Array): void {
    if (!this.host.limits.allowBytes(deviceId, bytes.length)) {
      console.warn('[remote] телефон шлёт больше своей доли - кадр отброшен')

      return this.overweight(deviceId, parsePhoneMessage(decodeBody(bytes)))
    }

    const message = parsePhoneMessage(decodeBody(bytes))

    if (!message) return
    if (message.k === 'part') return this.assemble(deviceId, message)
    if (this.admit(deviceId, message)) this.dispatch(deviceId, message)
  }

  forget(deviceId: string): void {
    this.parts.forget(deviceId)
    this.noticed.delete(deviceId)
  }

  private dispatch(deviceId: string, message: Exclude<PhoneMessage, PartMessage>) {
    if (message.k === 'ping') {
      return this.host.reply(
        deviceId,
        { p: PROTOCOL_VERSION, k: 'pong', n: message.n ?? 0 },
        'urgent',
      )
    }

    if (message.k === 'unpair') return this.host.unpair(deviceId)

    this.host.handlers.handle(deviceId, message)
  }

  /**
   * Предел частоты - при получении, как у каждого слова: работа, принятая до отзыва или
   * выключения, уже посчитана. Команда считается по имени (отказы - одной кучей); повтор
   * команды, которую мост уже принял, не считается - это доставка, а не новая просьба.
   */
  private admit(deviceId: string, message: Exclude<PhoneMessage, PartMessage>): boolean {
    if (message.k !== 'cmd') return this.host.limits.allow(deviceId, message.k)
    if (this.host.handlers.knownCommand(deviceId, message.id)) return true
    if (this.host.limits.allow(deviceId, limitKindOf(message))) return true

    this.rateLimited(deviceId, message)

    return false
  }

  /** Кадр тяжелее доли: команде - итог, куску - слово о его сообщении, прочему - ничего. */
  private overweight(deviceId: string, message: PhoneMessage | null) {
    if (message?.k === 'cmd') return this.rateLimited(deviceId, message)
    if (message?.k === 'part') this.notice(deviceId, 'rateLimited', message.id)
  }

  private rateLimited(deviceId: string, message: CmdMessage) {
    this.host.reply(
      deviceId,
      { p: PROTOCOL_VERSION, k: 'result', id: message.id, ok: false, code: 'rateLimited' },
      'urgent',
    )
  }

  private assemble(deviceId: string, part: PartMessage) {
    if (!this.host.limits.allow(deviceId, part.k)) {
      return this.notice(deviceId, 'rateLimited', part.id)
    }

    const { outcome, dropped } = this.parts.take(deviceId, part)

    for (const id of dropped) this.notice(deviceId, 'partsRefused', id)

    if (outcome.kind === 'refused') {
      console.warn('[remote] часть сообщения отклонена:', outcome.why)

      return this.notice(deviceId, 'partsRefused', part.id)
    }

    if (outcome.kind === 'waiting') return

    const whole = decodeBody(new TextEncoder().encode(outcome.text))
    const assembled = whole && mayArriveInParts(whole) ? parsePhoneMessage(whole) : null

    if (!assembled || assembled.k === 'part') {
      console.warn('[remote] частями пришло не сообщение')

      return this.notice(deviceId, 'partsRefused', part.id)
    }

    if (this.admit(deviceId, assembled)) this.dispatch(deviceId, assembled)
  }

  /** Слово телефону о сообщении частями - одно на сообщение, сколько бы кусков ни отбросилось. */
  private notice(deviceId: string, code: NoticeCode, about: string) {
    const said = this.noticed.get(deviceId) ?? []
    const key = `${code}:${about}`

    if (said.includes(key)) return

    this.noticed.set(deviceId, [...said, key].slice(-NOTICED_KEPT))
    this.host.reply(
      deviceId,
      { p: PROTOCOL_VERSION, k: 'notice', level: 'warning', code, about },
      'urgent',
    )
  }
}
