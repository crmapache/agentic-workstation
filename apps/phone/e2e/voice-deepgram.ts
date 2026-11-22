import type {
  DeepgramDial,
  DeepgramHandlers,
} from '../../desktop/src/main/voice/deepgram/deepgram-link'

/** Кусок звука подделки синтеза: 50 мс PCM16 24 кГц. */
const CHUNK_BYTES = 2400
/** Подделка отдаёт кусок каждые 40 мс - чуть быстрее реального времени, как Flux TTS. */
const CHUNK_EVERY_MS = 40
/** Звука на знак текста: фраза в тридцать знаков - около двух секунд. */
const MS_PER_CHAR = 60

/** Тон, а не тишина: страница в Chromium честно его играет. */
const tone = (): Buffer => {
  const pcm = Buffer.alloc(CHUNK_BYTES)

  for (let index = 0; index < CHUNK_BYTES / 2; index += 1) {
    pcm.writeInt16LE(Math.round(Math.sin(index / 8) * 3000), index * 2)
  }

  return pcm
}

/**
 * Подделка Deepgram для сквозной проверки звонка: распознавание молчит, синтез отдаёт звук хода
 * в реальном времени (SpeechStarted, куски, SpeechMetadata) и слушается Interrupt, как Flux TTS
 * в пробе 2026-11-21.
 */
export const fakeDeepgram = () => {
  let interrupts = 0

  const speak = (handlers: DeepgramHandlers) => {
    let text = ''
    let streaming: ReturnType<typeof setInterval> | null = null
    let sentMs = 0

    const stopStream = () => {
      if (streaming) clearInterval(streaming)
      streaming = null
    }

    const onMessage = (data: string) => {
      const message = JSON.parse(data) as { type: string; text?: string }

      if (message.type === 'Speak') {
        if (!text) handlers.text(JSON.stringify({ type: 'SpeechStarted' }))
        text += message.text ?? ''
      } else if (message.type === 'Flush') {
        const total = text.length * MS_PER_CHAR
        let left = total

        streaming = setInterval(() => {
          handlers.audio(tone())
          sentMs += 50
          left -= 50

          if (left > 0) return

          stopStream()
          text = ''
          handlers.text(JSON.stringify({ type: 'SpeechMetadata', audio_duration_ms: total }))
        }, CHUNK_EVERY_MS)
      } else if (message.type === 'Interrupt') {
        interrupts += 1
        stopStream()
        text = ''
        handlers.text(
          JSON.stringify({ type: 'SpeechInterrupted', audio_played_ms: sentMs, text_spoken: '' }),
        )
      }
    }

    return { onMessage, stop: stopStream }
  }

  const dial: DeepgramDial = (url, _key, handlers) => {
    const tts = url.includes('/v2/speak') ? speak(handlers) : null

    setTimeout(() => handlers.open(), 5)

    return {
      send: (data) => {
        if (typeof data === 'string') tts?.onMessage(data)
      },
      close: () => tts?.stop(),
    }
  }

  return { dial, interrupted: () => interrupts > 0 }
}
