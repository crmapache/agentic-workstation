import type { VoiceRegion } from '@shared/voice'

import type { Timer } from '../call/utterances'
import type { DeepgramDial } from './deepgram-link'
import { FluxSpeak } from './flux-speak'

/** Синтез молчит дольше этого (ни звука, ни конца) - Deepgram не ответил. */
export const SPEECH_STALL_MS = 15_000

export type SpeechStreamOptions = {
  key: string
  region: VoiceRegion
  voice: string
  speed: number
  /** Фразы одного хода: уходят `Speak` по одной, как ответ в звонке, и `Flush` после всех. */
  sentences: readonly string[]
  dial: DeepgramDial
  timer: Timer
  /** Кусок звука, PCM16 24 кГц, по мере синтеза. */
  onAudio: (pcm: Buffer) => void
  /** Ход кончился: весь звук отдан (true) или синтез сорвался (false). Один раз. */
  onEnd: (complete: boolean) => void
}

/**
 * Текст в звук Flux TTS одним ходом, кусками по мере синтеза: образец голоса и «Прочитать вслух»
 * (ADR 0106). Обрыв соединения и молчание дольше SPEECH_STALL_MS - срыв. Возвращает «отменить»:
 * синтез закрывается, onEnd не зовётся.
 */
export const streamSpeech = (options: SpeechStreamOptions): (() => void) => {
  const { key, region, voice, speed, dial, timer } = options
  let isOver = false
  let cancelStall = () => undefined as void
  const close = () => {
    isOver = true
    cancelStall()
    speaker.stop()
  }
  const end = (complete: boolean) => {
    if (isOver) return

    close()
    options.onEnd(complete)
  }
  const watch = () => {
    cancelStall()
    cancelStall = timer(() => end(false), SPEECH_STALL_MS)
  }
  const speaker: FluxSpeak = new FluxSpeak({
    key,
    region,
    voice,
    speed,
    dial,
    timer,
    onEvent: (event) => {
      if (isOver) return

      if (event.kind === 'audio') {
        watch()
        options.onAudio(event.pcm)
      } else if (event.kind === 'done') end(true)
      else if (event.kind === 'lost') end(false)
    },
  })

  // Сказать нечего - и ждать нечего: срыв сразу, а не через SPEECH_STALL_MS.
  if (options.sentences.length === 0) {
    queueMicrotask(() => end(false))

    return close
  }

  watch()

  for (const sentence of options.sentences) speaker.say(sentence)

  speaker.finish()

  return () => {
    if (!isOver) close()
  }
}
