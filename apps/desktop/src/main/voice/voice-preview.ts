import type { VoiceRegion, VoiceLanguage } from '@shared/voice'

import type { Timer } from './call/utterances'
import { sampleOf } from './call/voice-phrases'
import type { DeepgramDial } from './deepgram/deepgram-link'
import { FluxSpeak } from './deepgram/flux-speak'

/** Образец не пришёл за столько - Deepgram не ответил. */
const PREVIEW_MS = 15_000

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
}): Promise<Uint8Array | null> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = []
    const { key, region, voice, speed, dial, timer } = options
    let finish = (_pcm: Uint8Array | null) => undefined as void
    const speaker = new FluxSpeak({
      key,
      region,
      voice,
      speed,
      dial,
      timer,
      onEvent: (event) => {
        if (event.kind === 'audio') chunks.push(event.pcm)
        else if (event.kind === 'done') finish(chunks.length > 0 ? Buffer.concat(chunks) : null)
      },
    })
    const cancel = timer(() => finish(null), PREVIEW_MS)

    finish = (pcm) => {
      finish = () => undefined
      cancel()
      speaker.stop()
      resolve(pcm ? new Uint8Array(pcm) : null)
    }

    speaker.say(sampleOf(options.language))
    speaker.finish()
  })
