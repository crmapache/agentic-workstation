import { settledEnd, speakableSentences } from './speakable'

/**
 * Ответ агента по фразам, пока он пишется: каждый раз, когда текст подрос, отдаёт фразы, которые
 * закончились с прошлого раза. Озвучка идёт по предложениям, не дожидаясь конца ответа (spec,
 * «Задержка»). Законченная часть текста только растёт, поэтому фразы считаются от начала, а
 * отданные - по числу.
 */
export class SentenceFeed {
  private given = 0
  private text = ''

  /**
   * Новые фразы текста. streaming - текст ещё пишется: недописанная фраза ждёт. Текст начался
   * иначе, чем прошлый (ответ переписан), - счёт заново, сказанное не повторяется.
   */
  take(text: string, streaming: boolean): string[] {
    if (!text.startsWith(this.text.slice(0, settledEnd(this.text)))) this.given = 0

    this.text = text

    const sentences = speakableSentences(streaming ? text.slice(0, settledEnd(text)) : text)
    const fresh = sentences.slice(this.given)

    this.given = sentences.length

    return fresh
  }
}
