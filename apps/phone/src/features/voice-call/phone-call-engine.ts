import type { VoiceEvent } from '@agentic-workstation/remote-protocol/agent-messages'
import type { AudioFrame } from '@agentic-workstation/remote-protocol/audio-frame'
import { encodeAudio } from '@agentic-workstation/remote-protocol/audio-frame'
import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'
import { AnswerPlayer } from '@agentic-workstation/voice-audio/answer-player'
import type { MicCapture } from '@agentic-workstation/voice-audio/mic-capture'
import { startMicCapture } from '@agentic-workstation/voice-audio/mic-capture'

import type { RemoteClient } from '../../remote/remote-client'

/** Тон «соединено»: звонок готов слушать (spec, «Соединено»). */
const CONNECTED_TONE_HZ = 880

/**
 * Звук голосового звонка на телефоне (ADR 0104): микрофон - кадрами в IDE, ответ - в динамик,
 * сигналы звонка - приглушить, сбросить, тон. Готовится прямо в нажатии кнопки: Safari даёт
 * звучать только звуку, начатому человеком, и там же спрашивает микрофон. До ответа IDE кадры
 * микрофона не уходят. Экран держится включённым (Wake Lock); страница ушла с экрана - звонок
 * на паузе, вернулась - продолжается.
 */
export class PhoneCallEngine {
  private callId: string | null = null
  private frame = 0
  private hidden = document.visibilityState === 'hidden'
  private wakeLock: WakeLockSentinel | null = null

  private constructor(
    private readonly client: RemoteClient,
    private readonly agentId: string,
    private readonly player: AnswerPlayer,
    private mic: MicCapture | null,
  ) {}

  /** В нажатии кнопки: динамик и микрофон. Микрофон не дали - исключение, звонка нет. */
  static async prepare(client: RemoteClient, agentId: string): Promise<PhoneCallEngine> {
    let engine: PhoneCallEngine | null = null
    const player = new AnswerPlayer((epoch, ms) => engine?.played(epoch, ms))

    try {
      const mic = await startMicCapture((pcm) => engine?.micFrame(pcm))

      engine = new PhoneCallEngine(client, agentId, player, mic)

      return engine
    } catch (error) {
      player.close()
      throw error
    }
  }

  /** IDE подняла звонок: кадры микрофона пошли, экран держится, пауза - по видимости. */
  attach(callId: string): void {
    if (this.callId) return

    this.callId = callId
    this.player.tone(CONNECTED_TONE_HZ)
    document.addEventListener('visibilitychange', this.visibility)
    void this.holdScreen()
  }

  audio(frame: AudioFrame): void {
    if (frame.kind === 'answer') this.player.play(frame.epoch, frame.pcm)
  }

  cue(event: VoiceEvent): void {
    if (event.kind === 'duck') this.player.duck(event.level)
    else if (event.kind === 'stopPlayback') this.player.stop(event.epoch)
    else if (event.kind === 'tone') this.player.tone()
  }

  setMuted(muted: boolean): void {
    this.mic?.setMuted(muted)
  }

  stop(): void {
    document.removeEventListener('visibilitychange', this.visibility)
    this.mic?.stop()
    this.mic = null
    this.player.close()
    void this.wakeLock?.release().catch(() => undefined)
    this.wakeLock = null
  }

  private micFrame(pcm: Uint8Array): void {
    if (!this.callId || this.hidden) return

    void this.client.sendBody(
      this.agentId,
      encodeAudio({ kind: 'mic', epoch: 0, frame: this.frame, pcm }),
    )
    this.frame += 1
  }

  private played(epoch: number, ms: number): void {
    if (this.callId) this.say({ act: 'played', callId: this.callId, epoch, ms })
  }

  private readonly visibility = () => {
    const callId = this.callId

    if (!callId) return

    this.hidden = document.visibilityState === 'hidden'
    this.say({ act: this.hidden ? 'pause' : 'resume', callId })
    // Wake Lock отпускается сам, когда страница скрыта: вернулась - взять снова.
    if (!this.hidden) void this.holdScreen()
  }

  private async holdScreen(): Promise<void> {
    if (!('wakeLock' in navigator) || this.wakeLock) return

    this.wakeLock = await navigator.wakeLock.request('screen').catch(() => null)
    this.wakeLock?.addEventListener('release', () => {
      this.wakeLock = null
    })
  }

  private say(message: Record<string, unknown>): void {
    void this.client.send(this.agentId, { p: PROTOCOL_VERSION, k: 'voice', ...message })
  }
}
