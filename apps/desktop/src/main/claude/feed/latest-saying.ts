import type { FeedPatch } from '@shared/claude-feed'

/** Фраза для строки, которая следит за работой, не длиннее этого: строка одна. */
const SAYING_MAX = 140

/** Конец фразы: знак конца и пробел или конец текста. Точка внутри «2.1» фразу не режет. */
const SENTENCE_GAP = /(?<=[.!?…])\s+|\n+/

const ENDS_SENTENCE = /[.!?…]\s*$|\n\s*$/

/** Разметка Markdown, которая в одной строке без отрисовки читалась бы мусором. */
const MARKUP = /[*_`]+|^\s*(?:#+|>|[-*]|\d+\.)\s+/gm

/**
 * Последняя законченная фраза текста модели. Пока текст идёт (streaming), недописанная фраза
 * не берётся: строка менялась бы на каждом слове, а не на каждой фразе. Длинная режется с «…».
 */
export const lastSentence = (text: string, streaming: boolean): string | null => {
  const sentences = text
    .replace(MARKUP, '')
    .split(SENTENCE_GAP)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const done = streaming && !ENDS_SENTENCE.test(text) ? sentences.slice(0, -1) : sentences
  const last = done.at(-1)

  if (!last) return null

  return last.length > SAYING_MAX ? `${last.slice(0, SAYING_MAX - 1).trimEnd()}…` : last
}

/**
 * Что модель разговора сказала последним в заплатке ленты: последняя законченная фраза её
 * ответа или размышления (у нынешних моделей их текст скрыт - тогда нечего). Для строк, которые
 * следят за работой со стороны: капсула Computer между шагами. В заплатке нет такого текста -
 * null.
 */
export const latestSaying = (patch: FeedPatch): string | null => {
  for (const item of [...patch.upserts].reverse()) {
    if (item.kind === 'assistant' || item.kind === 'thinking') {
      return lastSentence(item.text, item.streaming)
    }
  }

  return null
}
