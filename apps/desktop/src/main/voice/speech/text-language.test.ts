import { it, expect, describe } from 'vitest'

import { readLanguage, textLanguage } from './text-language'

/** Ответ агента из звонка владельца 2026-11-21: его озвучил португальский голос. */
const RUSSIAN_ANSWER =
  'За последние десять минут в WhatsApp была только переписка с Бьянкой. В 22:39 ты написал ей «hmm poquito», а в 22:40 она ответила с улыбкой, что ты заработаешь больше нежности поцелуями, и прислала эмодзи с поцелуем. Больше сообщений не было.'

describe('textLanguage', () => {
  it('reads a Russian answer with a Spanish quote as Russian, whatever the hint', () => {
    expect(textLanguage(RUSSIAN_ANSWER, 'pt')).toBe('ru')
    expect(textLanguage(RUSSIAN_ANSWER, 'es')).toBe('ru')
    expect(readLanguage(RUSSIAN_ANSWER)).toMatchObject({ language: 'ru', sure: true })
  })

  it('is sure from the first sentence of that answer', () => {
    const first = 'За последние десять минут в WhatsApp была только переписка с Бьянкой.'

    expect(readLanguage(first)).toMatchObject({ language: 'ru', sure: true })
  })

  it('does not let a quote switch the language of the text around it', () => {
    expect(
      textLanguage('You wrote her «привет, как дела у тебя сегодня» and she sent a kiss.', 'ru'),
    ).toBe('en')
    expect(
      textLanguage('Ella te escribió "what are you doing tonight" y nada más por ahora.', 'en'),
    ).toBe('es')
  })

  it('takes the quote itself when there is nothing outside it', () => {
    expect(textLanguage('«Привет, как дела?»', 'en')).toBe('ru')
  })

  it('tells the Latin languages apart by their small words', () => {
    expect(textLanguage('The build is green and all the tests pass now.', 'ru')).toBe('en')
    expect(textLanguage('Ya está, los correos de hoy no tienen nada urgente.', 'ru')).toBe('es')
    expect(textLanguage('Não há nada novo, você não tem mensagens hoje.', 'ru')).toBe('pt')
    expect(textLanguage("C'est fait, il n'y a pas de nouveaux messages.", 'ru')).toBe('fr')
    expect(textLanguage('Das ist erledigt, und es gibt keine neuen Nachrichten.', 'ru')).toBe('de')
    expect(textLanguage('Fatto, non ci sono nuovi messaggi per oggi.', 'ru')).toBe('it')
    expect(textLanguage('Het is klaar, er zijn geen nieuwe berichten.', 'ru')).toBe('nl')
  })

  it('knows the scripts that no Latin language shares', () => {
    expect(textLanguage('आज कोई नया संदेश नहीं है।', 'en')).toBe('hi')
    expect(textLanguage('今日は新しいメッセージはありません。', 'en')).toBe('ja')
  })

  it('keeps Russian with English product names in it Russian', () => {
    expect(textLanguage('Открыл GitHub Actions, PR зелёный.', 'en')).toBe('ru')
  })

  it('falls back to the hint when the text says nothing', () => {
    expect(textLanguage('Ok.', 'pt')).toBe('pt')
    expect(textLanguage('', 'ru')).toBe('ru')
    expect(readLanguage('Done.')).toEqual({ language: null, sure: false, leaders: [] })
  })

  it('is not sure from one shared Latin word, and lets the hint break a tie', () => {
    expect(readLanguage('de').sure).toBe(false)
    expect(textLanguage('que', 'pt')).toBe('pt')
    expect(textLanguage('que', 'es')).toBe('es')
  })
})
