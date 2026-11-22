import { isVoiceLanguage } from '@shared/voice'
import { VOICE_CATALOG } from '@shared/voice-catalog'
import type { VoiceInvokeContract } from '@shared/ipc/voice.contract'

import { desktopEndpoint, microphoneAllowed } from '../voice/desktop-endpoint'
import { previewVoice } from '../voice/voice-preview'
import { realTimer } from '../voice/voice-service'
import type { VoiceService } from '../voice/voice-service'
import type { VoiceStore } from '../voice/voice-store'
import { dialDeepgram } from '../voice/deepgram/deepgram-link'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'

type VoiceChannels = keyof VoiceInvokeContract

/** Кадр микрофона больше этого - не кадр: окно шлёт 80 мс (2560 байт). */
const MIC_FRAME_MAX = 64 * 1024
/** Ключ Deepgram - 40 знаков; длиннее этого - не ключ, а вставленный мусор. */
const KEY_MAX = 512

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** Каналы голосового режима (ADR 0104): окну не верим - строки, кадры и числа проверяются. */
export const createVoiceHandlers = (
  voice: VoiceService,
  store: VoiceStore,
  /** Звонок из панели начался: окно - к проекту Home, где его разговор. */
  showHome: () => Promise<unknown>,
): Pick<InvokeHandlers, VoiceChannels> => ({
  'voice:get': () => voice.view(),
  'voice:setSettings': ({ settings }) => voice.setSettings(settings),
  'voice:setKey': ({ key }) => {
    if (key !== null) assertString(key, 'key')
    if (key !== null && key.length > KEY_MAX) throw new Error('voice:setKey: key too long')

    return voice.setKey(key)
  },
  'voice:checkKey': ({ key }) => {
    if (key !== null) assertString(key, 'key')

    return voice.checkKey(key?.slice(0, KEY_MAX) ?? null)
  },
  'voice:preview': async ({ language, voice: model }) => {
    const key = store.key

    if (!isVoiceLanguage(language) || !key) return null
    if (!VOICE_CATALOG[language].some((option) => option.model === model)) return null

    const pcm = await previewVoice({
      key,
      region: store.settings.region,
      language,
      voice: model,
      speed: store.settings.speed,
      dial: dialDeepgram,
      timer: realTimer,
    })

    return pcm ? { pcm } : null
  },
  'voice:start': async () => {
    if (!(await microphoneAllowed())) return { ok: false, reason: 'microphone' }

    const outcome = await voice.start(desktopEndpoint)

    if (outcome.ok) await showHome()

    return outcome
  },
  'voice:end': ({ callId }) => {
    assertString(callId, 'callId')
    voice.end(callId)
  },
  'voice:stop': ({ callId }) => {
    assertString(callId, 'callId')
    voice.call(callId)?.stop()
  },
  'voice:mute': ({ callId, on }) => {
    assertString(callId, 'callId')
    voice.call(callId)?.mute(on === true)
  },
  'voice:mic': ({ callId, pcm }) => {
    assertString(callId, 'callId')
    if (!(pcm instanceof Uint8Array) || pcm.byteLength > MIC_FRAME_MAX) return

    voice.call(callId)?.mic(pcm)
  },
  'voice:played': ({ callId, epoch, ms }) => {
    assertString(callId, 'callId')
    if (!isFiniteNumber(epoch) || !isFiniteNumber(ms)) return

    voice.call(callId)?.played(epoch, ms)
  },
})
