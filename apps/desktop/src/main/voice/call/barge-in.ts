import type { VoiceBargeIn } from '@shared/voice'

import type { FluxTurn } from '../deepgram/flux-turn'
import { confidenceOf } from '../deepgram/flux-turn'
import { hasStopWord, isBackchannel, isEcho, wordsOf } from './voice-words'

/**
 * Окно проверки после StartOfTurn (spec, «Перебивание», шаг 2): за это время слова должны
 * подтвердить, что человек правда говорит, иначе громкость возвращается.
 */
export const BARGE_IN_WINDOW_MS = 700
/** Громкость ответа, пока проверяем: агента слышно, но он не мешает говорить. */
export const DUCK_LEVEL = 0.2

/** stop - замолчать и слушать; wait - ещё неясно; ignore - этот уровень голосом не перебить. */
export type BargeVerdict = 'stop' | 'wait' | 'ignore'

/**
 * Перебил ли человек агента (spec, таблица «Чувствительность»): слово остановки - всегда да;
 * «только кнопкой» - голосом нет; поддакивание и эхо своего ответа - ещё нет; дальше - по числу
 * слов и уверенности уровня. spoken - что агент сказал за последние секунды.
 */
export const judgeBargeIn = (level: VoiceBargeIn, turn: FluxTurn, spoken: string): BargeVerdict => {
  const text = turn.transcript

  if (hasStopWord(text)) return 'stop'
  if (level === 'button') return 'ignore'
  if (isBackchannel(text) || isEcho(text, spoken)) return 'wait'

  const count = Math.max(wordsOf(text).length, turn.words.length)
  const confidence = confidenceOf(turn.words)

  switch (level) {
    case 'high':
      return count >= 1 ? 'stop' : 'wait'
    case 'medium':
      return count >= 2 || (count === 1 && confidence >= 0.85) ? 'stop' : 'wait'
    case 'low':
      return count >= 3 && confidence >= 0.7 ? 'stop' : 'wait'
  }
}
