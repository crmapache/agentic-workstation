import type { VoiceLanguage, VoiceSettings } from '@shared/voice'
import type { VoiceReadRefusal } from '@shared/voice-reading'

import type { VoiceSamples } from '../voice-samples'
import type { SpokenAnswer } from '../call/call-mouth'
import type { Timer } from '../call/utterances'
import type { DeepgramDial } from '../deepgram/deepgram-link'
import { speakableSentences } from '../speech/speakable'
import { textLanguage } from '../speech/text-language'
import type { ReadingSink } from './reading'
import { Reading } from './reading'

/**
 * Сколько знаков ответа читать вслух: дальше - не дочитывать. Восемь тысяч знаков - около
 * десяти минут речи и двадцати мегабайт звука; длиннее - это документ, а не ответ.
 */
export const READ_MAX_CHARS = 8000

/** Просьба прочитать: id - чьё это чтение у конечной точки, owner - окно или телефон. */
export type ReadRequest = { id: string; owner: string; text: string; sink: ReadingSink }

export type VoiceReaderDeps = {
  store: { readonly key: string | null; readonly settings: VoiceSettings }
  cache: Pick<VoiceSamples, 'peek' | 'keep'>
  dial: DeepgramDial
  timer: Timer
}

/**
 * Фразы ответа, которые звучат вслух, - тем же фильтром, что ответ в звонке (код, таблицы,
 * ссылки и разметка не читаются): тогда звук ответа, сказанного звонком, подходит и кнопке.
 */
export const readableSentences = (text: string): string[] => {
  const sentences: string[] = []
  let chars = 0

  for (const sentence of speakableSentences(text)) {
    chars += sentence.length + 1
    if (chars > READ_MAX_CHARS && sentences.length > 0) break
    sentences.push(sentence)
  }

  return sentences
}

/** Язык, к которому склоняться, когда текст не решает сам: выбранный или первый ожидаемый. */
const hintOf = (settings: VoiceSettings): VoiceLanguage =>
  settings.languageMode === 'multi' ? (settings.expected[0] ?? 'en') : settings.languageMode

/**
 * Чтение вслух ответов модели (ADR 0106): одно на конечную точку - новое у того же окна или
 * телефона обрывает прежнее. Голос - по языку текста ответа, скорость - из настроек; звук - с
 * диска, если этот текст этим голосом уже звучал за месяц, иначе из Flux TTS.
 */
export class VoiceReader {
  private readonly readings = new Map<string, { id: string; reading: Reading }>()

  constructor(private readonly deps: VoiceReaderDeps) {}

  /** Начать чтение; нельзя - причина. Звук и конец идут в sink. */
  read(request: ReadRequest): VoiceReadRefusal | null {
    const { store, cache, dial, timer } = this.deps
    const { key, settings } = store

    if (!key) return 'noKey'

    const sentences = readableSentences(request.text)

    if (sentences.length === 0) return 'empty'

    this.stopOwner(request.owner)

    const text = sentences.join(' ')
    const language = textLanguage(text, hintOf(settings))
    const reading: Reading = new Reading({
      sample: { language, voice: settings.voices[language], speed: settings.speed, text },
      sentences,
      sink: request.sink,
      cache,
      key,
      region: settings.region,
      dial,
      timer,
      onFinished: () => {
        if (this.readings.get(request.owner)?.reading === reading) {
          this.readings.delete(request.owner)
        }
      },
    })

    this.readings.set(request.owner, { id: request.id, reading })
    reading.start()

    return null
  }

  /** Остановить чтение конечной точки - только своё: стоп прежнего нажатия нового не гасит. */
  stop(owner: string, id: string): void {
    if (this.readings.get(owner)?.id === id) this.stopOwner(owner)
  }

  /** Всё замолкает: начался звонок или IDE закрывается. */
  stopAll(): void {
    for (const owner of [...this.readings.keys()]) this.stopOwner(owner)
  }

  /**
   * Ответ, который звонок сказал целиком, - на диск под ключом чтения: кнопка у этого ответа
   * сыграет его, не спрашивая Deepgram снова. Ключ тот же, потому что фразы - тем же фильтром.
   */
  keep(spoken: SpokenAnswer): void {
    const { pcm, ...sample } = spoken

    void this.deps.cache.keep(sample, pcm)
  }

  private stopOwner(owner: string): void {
    const known = this.readings.get(owner)

    this.readings.delete(owner)
    known?.reading.stop()
  }
}
