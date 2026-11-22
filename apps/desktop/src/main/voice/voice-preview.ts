import type { VoiceRegion, VoiceLanguage } from '@shared/voice'

import type { Timer } from './call/utterances'
import { sampleOf } from './call/voice-phrases'
import type { DeepgramDial } from './deepgram/deepgram-link'
import { streamSpeech } from './deepgram/speech-stream'

/**
 * Образец голоса для «Прослушать» в настройках: короткая фраза на языке голоса, PCM16 24 кГц
 * целиком. Окно играет его само; null - ключа нет или Deepgram не ответил вовремя.
 */
export const previewVoice = (options: {
  key: string
  region: VoiceRegion
  language: VoiceLanguage
  voice: string
  speed: number
  dial: DeepgramDial
  timer: Timer
  /** Свой текст вместо образца языка - для живой проверки звонка. */
  text?: string
}): Promise<Uint8Array | null> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = []
    const { key, region, voice, speed, dial, timer } = options

    streamSpeech({
      key,
      region,
      voice,
      speed,
      dial,
      timer,
      sentences: [options.text ?? sampleOf(options.language)],
      onAudio: (pcm) => chunks.push(pcm),
      onEnd: (complete) =>
        resolve(complete && chunks.length > 0 ? new Uint8Array(Buffer.concat(chunks)) : null),
    })
  })
