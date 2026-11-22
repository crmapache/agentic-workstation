import type { VoiceEvent, VoiceMessage } from '@agentic-workstation/remote-protocol/agent-messages'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'
import type { VoicePhoneMessage } from '@agentic-workstation/remote-protocol/phone-messages'

import type { VoicePort } from '../bridge/bridge-ports'
import type { Timer } from '../../voice/call/utterances'
import { AnswerChunks } from './answer-chunks'

type ReadMessage = Extract<VoicePhoneMessage, { act: 'read' }>

export type PhoneReadingDeps = {
  voice: Pick<VoicePort, 'read' | 'stopReading'>
  /** Текст ответа модели из ленты разговора; нет такого ответа - null. */
  answerText: (conversationId: string, itemId: string) => Promise<string | null>
  /** Слово телефону - срочным, как у звонка. */
  send: (deviceId: string, message: VoiceMessage) => void
  /** Кадр звука телефону сразу, без очереди. */
  stream: (deviceId: string, body: Uint8Array) => void
  timer: Timer
}

/** Чтение телефона в главном процессе: своё у каждого телефона, рядом с чтением окна. */
const ownerOf = (deviceId: string) => `phone:${deviceId}`

/**
 * Чтение вслух ответа с телефона (ADR 0106): телефон называет разговор и элемент ленты, IDE
 * берёт текст у себя - телефон мог получить ответ карточкой (не влез в кадр), а ключ Deepgram
 * и синтез остаются здесь. Звук - кадрами вида reading с номером чтения телефона, конец или
 * отказ - словом `voice`. Одно чтение на телефон: новое обрывает прежнее.
 */
export class PhoneReadings {
  /** Чьё чтение идёт у телефона: ref его нажатия. */
  private readonly current = new Map<string, string>()

  constructor(private readonly deps: PhoneReadingDeps) {}

  async read(deviceId: string, message: ReadMessage): Promise<void> {
    const { ref } = message

    this.stop(deviceId)
    this.current.set(deviceId, ref)

    const text = await this.deps
      .answerText(message.conversationId, message.itemId)
      .catch(() => null)

    // Пока искали текст, телефон остановил это чтение или начал другое.
    if (this.current.get(deviceId) !== ref) return
    if (!text) return this.refuse(deviceId, ref, 'missing')

    const frames = new AnswerChunks(
      this.deps.timer,
      (body) => this.deps.stream(deviceId, body),
      'reading',
    )
    const refusal = this.deps.voice.read({
      id: ref,
      owner: ownerOf(deviceId),
      text,
      sink: {
        audio: (pcm) => frames.push(message.n, pcm),
        end: (outcome) => {
          // Недосланный хвост - раньше слова о конце: иначе телефон закончил бы без него.
          frames.flush()
          if (this.current.get(deviceId) === ref) this.current.delete(deviceId)
          this.event(deviceId, { kind: 'reading', ref, outcome })
        },
      },
    })

    if (refusal) this.refuse(deviceId, ref, refusal)
  }

  /** Телефон остановил чтение; ref - только это нажатие, без него - любое. */
  stop(deviceId: string, ref?: string): void {
    const known = this.current.get(deviceId)

    if (!known || (ref !== undefined && ref !== known)) return

    this.current.delete(deviceId)
    this.deps.voice.stopReading(ownerOf(deviceId), known)
  }

  /** Телефон отпустили или линия гаснет: его чтение молкнет. */
  forget(deviceId: string): void {
    this.stop(deviceId)
  }

  stopAll(): void {
    for (const deviceId of [...this.current.keys()]) this.stop(deviceId)
  }

  private refuse(deviceId: string, ref: string, reason: string): void {
    if (this.current.get(deviceId) === ref) this.current.delete(deviceId)
    this.event(deviceId, { kind: 'reading', ref, outcome: 'refused', reason })
  }

  private event(deviceId: string, event: VoiceEvent): void {
    this.deps.send(deviceId, { p: PROTOCOL_VERSION, k: 'voice', event })
  }
}
