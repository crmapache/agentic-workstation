import type { VoiceCue, VoiceCallView } from '@shared/voice'

import type {
  VoiceEvent,
  VoiceMessage,
  VoiceCallWire,
} from '@agentic-workstation/remote-protocol/agent-messages'
import type { AudioFrame } from '@agentic-workstation/remote-protocol/audio-frame'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'
import type { VoicePhoneMessage } from '@agentic-workstation/remote-protocol/phone-messages'

import type { VoicePort } from '../bridge/bridge-ports'
import type { Timer } from '../../voice/call/utterances'
import type { VoiceEndpoint } from '../../voice/call/voice-endpoint'
import { AnswerChunks } from './answer-chunks'

/**
 * Микрофон телефона молчит дольше этого, а паузы он не объявлял, - связь потеряна: звонок ждёт
 * её минуту (spec, «Обрыв связи телефона с релеем»). Кадры идут каждые 80 мс.
 */
export const SILENT_LINE_MS = 3000

export type PhoneVoiceDeps = {
  voice: VoicePort
  /** Слово звонка телефону - срочным: оно управляет звуком, который уже летит. */
  send: (deviceId: string, message: VoiceMessage) => void
  /** Кадр звука телефону сразу, без очереди: опоздавший звук не нужен. */
  stream: (deviceId: string, body: Uint8Array) => void
  /** Ключ проекта разговора звонка (Home) на линии телефона. */
  projectKey: () => string
  timer: Timer
}

type PhoneCall = {
  ref: string
  callId: string
  view: VoiceCallView | null
  answer: AnswerChunks
  paused: boolean
  lost: boolean
  cancelSilence: (() => void) | null
}

/**
 * Звонок с телефона (ADR 0104): телефон - конечная точка звонка через релей. Начать, кнопки и
 * отчёт о проигранном - словами `voice`, микрофон - кадрами звука; ответ - кадрами по 200 мс и
 * сигналами. Звонок один на IDE, у телефона - свой на каждую IDE.
 */
export class PhoneVoiceDesk {
  private readonly calls = new Map<string, PhoneCall>()
  private readonly followUps = new Map<string, string>()

  constructor(private readonly deps: PhoneVoiceDeps) {}

  message(deviceId: string, message: VoicePhoneMessage): void {
    if (message.act === 'start') return void this.start(deviceId, message.ref)

    const known = this.calls.get(deviceId)
    const call = known?.callId === message.callId ? this.deps.voice.call(message.callId) : null

    if (!known || !call) return

    switch (message.act) {
      case 'end':
        return call.end('hangup')
      case 'stop':
        return call.stop()
      case 'mute':
        return call.mute(message.on)
      case 'pause':
        known.paused = true
        known.cancelSilence?.()

        return call.pause()
      case 'resume':
        known.paused = false
        this.watchSilence(deviceId, known)

        return call.resume()
      case 'played':
        return call.played(message.epoch, message.ms)
    }
  }

  audio(deviceId: string, frame: AudioFrame): void {
    const known = this.calls.get(deviceId)
    const call = known ? this.deps.voice.call(known.callId) : null

    if (!known || !call || frame.kind !== 'mic') return

    // Кадр микрофона - знак, что страница видна: слово «возврат» могло не дойти, пока поднималась
    // линия после блокировки, а без этого звонок так и висел бы на паузе.
    if (known.paused) {
      known.paused = false
      call.resume()
    }

    if (known.lost) {
      known.lost = false
      call.lineBack()
    }

    call.mic(frame.pcm)
    this.watchSilence(deviceId, known)
  }

  /** Разговор доделал работу: какому телефону сказать (звонок с него положили посреди работы). */
  takeFollowUp(conversationId: string): string | null {
    const deviceId = this.followUps.get(conversationId) ?? null

    this.followUps.delete(conversationId)

    return deviceId
  }

  /** Телефон отпустили: его звонок кончается. */
  forget(deviceId: string): void {
    const known = this.calls.get(deviceId)

    if (known) this.deps.voice.end(known.callId, 'lostLine')
  }

  stop(): void {
    for (const deviceId of [...this.calls.keys()]) this.forget(deviceId)
  }

  private async start(deviceId: string, ref: string): Promise<void> {
    const known = this.calls.get(deviceId)

    // Повтор той же просьбы (ответ не дошёл) - тот же звонок, а не отказ «занято».
    if (known?.ref === ref && known.view) {
      return this.event(deviceId, { kind: 'started', ref, call: this.wire(known.view) })
    }

    const pending: PhoneCall = {
      ref,
      callId: '',
      view: null,
      answer: new AnswerChunks(this.deps.timer, (body) => this.deps.stream(deviceId, body)),
      paused: false,
      lost: false,
      cancelSilence: null,
    }
    const outcome = await this.deps.voice.start(this.endpoint(deviceId, pending))

    if (!outcome.ok) return this.event(deviceId, { kind: 'refused', ref, reason: outcome.reason })

    pending.callId = outcome.call.id
    pending.view = outcome.call
    this.calls.set(deviceId, pending)
    this.watchSilence(deviceId, pending)
    this.event(deviceId, { kind: 'started', ref, call: this.wire(outcome.call) })
  }

  private endpoint(deviceId: string, call: PhoneCall): VoiceEndpoint {
    return {
      origin: 'phone',
      play: (pcm, epoch) => call.answer.push(epoch, pcm),
      cue: (cue) => this.cue(deviceId, call, cue),
    }
  }

  private cue(deviceId: string, call: PhoneCall, cue: VoiceCue): void {
    switch (cue.kind) {
      case 'state':
        call.view = cue.call
        call.callId ||= cue.call.id

        return this.event(deviceId, { kind: 'state', call: this.wire(cue.call) })
      case 'duck':
        return this.event(deviceId, { kind: 'duck', callId: call.callId, level: cue.level })
      case 'stopPlayback':
        call.answer.drop(cue.epoch)

        return this.event(deviceId, { kind: 'stopPlayback', callId: call.callId, epoch: cue.epoch })
      case 'tone':
        return this.event(deviceId, { kind: 'tone', callId: call.callId })
      case 'transcript':
        return
      case 'ended':
        return this.ended(deviceId, call, cue)
    }
  }

  private ended(deviceId: string, call: PhoneCall, cue: Extract<VoiceCue, { kind: 'ended' }>) {
    call.cancelSilence?.()
    call.answer.drop(Number.MAX_SAFE_INTEGER)
    if (this.calls.get(deviceId) === call) this.calls.delete(deviceId)
    // Звонок положили, пока агент работал: когда он доделает, телефону - пуш (ADR 0104).
    if (call.view?.agentBusy) {
      this.followUps.set(cue.conversationId, deviceId)
    }

    this.event(deviceId, {
      kind: 'ended',
      callId: call.callId,
      reason: cue.reason,
      conversationId: cue.conversationId,
      projectKey: this.deps.projectKey(),
    })
  }

  private watchSilence(deviceId: string, call: PhoneCall): void {
    call.cancelSilence?.()
    call.cancelSilence = this.deps.timer(() => {
      call.cancelSilence = null
      if (call.paused || this.calls.get(deviceId) !== call) return

      call.lost = true
      this.deps.voice.call(call.callId)?.lineLost()
    }, SILENT_LINE_MS)
  }

  private wire(view: VoiceCallView): VoiceCallWire {
    return {
      callId: view.id,
      conversationId: view.conversationId,
      projectKey: this.deps.projectKey(),
      provider: view.provider,
      state: view.state,
      tool: view.tool,
      heard: view.heard,
      muted: view.muted,
      language: view.language,
    }
  }

  private event(deviceId: string, event: VoiceEvent): void {
    this.deps.send(deviceId, { p: PROTOCOL_VERSION, k: 'voice', event })
  }
}
