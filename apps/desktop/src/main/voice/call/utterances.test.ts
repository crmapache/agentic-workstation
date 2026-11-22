import { it, expect, describe } from 'vitest'

import type { FluxTurn } from '../deepgram/flux-turn'
import { judgeBargeIn } from './barge-in'
import type { Utterance } from './utterances'
import { PAUSE_MS, pickLanguage, UtteranceDesk } from './utterances'
import { isEcho, isStopOnly, hasStopWord, isBackchannel } from './voice-words'

const turn = (
  event: FluxTurn['event'],
  transcript: string,
  confidence = 0.95,
  languages: string[] = ['ru'],
): FluxTurn => ({
  event,
  turnIndex: 0,
  transcript,
  words: transcript
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({ word, confidence })),
  languages,
})

const desk = (busy = false) => {
  const heard: string[] = []
  const said: Utterance[] = []
  const timers: Array<{ run: () => void; ms: number }> = []
  const clock = { now: 0 }
  const subject = new UtteranceDesk({
    mode: 'multi',
    timer: (run, ms) => {
      const entry = { run, ms }

      timers.push(entry)

      return () => timers.splice(timers.indexOf(entry), 1)
    },
    now: () => clock.now,
    onHeard: (text) => heard.push(text),
    onUtterance: (utterance) => said.push(utterance),
    isAgentBusy: () => busy,
  })
  /** Человек молчит, пока не кончится пауза: то, что ждало, уходит. */
  const pause = () => timers.shift()?.run()

  return { subject, heard, said, timers, clock, pause }
}

describe('UtteranceDesk', () => {
  it('sends a Russian line as Russian even when Flux labels it Portuguese', () => {
    const { subject, said, pause } = desk()

    subject.turn(
      turn(
        'EndOfTurn',
        'Ok, a теперь посмотри за последние десять минут в WhatsApp были какие-нибудь сообщения?',
        0.9,
        ['pt'],
      ),
    )
    pause()

    expect(said[0]?.language).toBe('ru')
  })

  it('shows the live text and sends the line with its language after the pause', () => {
    const { subject, heard, said, timers, pause } = desk()

    subject.turn(turn('StartOfTurn', 'Посмотри'))
    subject.turn(turn('EndOfTurn', 'Посмотри встречи на завтра'))

    expect(said).toEqual([])
    expect(timers.map((timer) => timer.ms)).toEqual([PAUSE_MS])
    expect(heard).toEqual(['Посмотри', 'Посмотри встречи на завтра'])

    pause()
    expect(said).toEqual([{ text: 'Посмотри встречи на завтра', language: 'ru' }])
    expect(heard.at(-1)).toBe('')
  })

  it('glues a phrase Flux cut on a short pause into one line', () => {
    const { subject, said, timers, clock, pause } = desk()

    subject.turn(turn('EndOfTurn', 'Найди эту точку на карте'))
    clock.now = 1200
    subject.turn(turn('StartOfTurn', 'и построить'))
    expect(timers).toHaveLength(0)
    subject.turn(turn('EndOfTurn', 'и построить до неё маршрут.'))
    pause()

    expect(said).toEqual([
      { text: 'Найди эту точку на карте и построить до неё маршрут.', language: 'ru' },
    ])
  })

  it('counts the pause from the last word, not from Flux closing the turn', () => {
    const { subject, said, timers, clock } = desk()

    subject.turn(turn('StartOfTurn', 'Посмотри'))
    clock.now = 900
    subject.turn(turn('Update', 'Посмотри почту'))
    clock.now = 1500
    subject.turn(turn('Update', 'Посмотри почту'))
    clock.now = 1700
    subject.turn(turn('EndOfTurn', 'Посмотри почту.'))
    expect(timers.map((timer) => timer.ms)).toEqual([PAUSE_MS - 800])
    expect(said).toEqual([])
  })

  it('sends at once when Flux closed the turn after the pause had passed', () => {
    const { subject, said, timers, clock } = desk()

    subject.turn(turn('StartOfTurn', 'Посмотри почту за сегодня'))
    clock.now = PAUSE_MS
    subject.turn(turn('EndOfTurn', 'Посмотри почту за сегодня'))

    expect(timers).toHaveLength(0)
    expect(said).toEqual([{ text: 'Посмотри почту за сегодня', language: 'ru' }])
  })

  it('does not hold back a stop word', () => {
    const { subject, said, timers } = desk()

    subject.turn(turn('EndOfTurn', 'Стоп'))

    expect(timers).toHaveLength(0)
    expect(said).toEqual([{ text: 'Стоп', language: 'ru' }])
  })

  it('keeps waiting through updates without words', () => {
    const { subject, timers } = desk()

    subject.turn(turn('EndOfTurn', 'Посмотри почту за сегодня'))
    subject.turn(turn('Update', ''))

    expect(timers).toHaveLength(1)
  })

  it('still sends the line said before a turn over the answer that was skipped', () => {
    const { subject, said, heard, timers, pause } = desk()

    subject.turn(turn('EndOfTurn', 'Посмотри почту за сегодня'))
    subject.turn(turn('StartOfTurn', 'угу'))
    expect(timers).toHaveLength(0)

    subject.skip()
    expect(heard.at(-1)).toBe('Посмотри почту за сегодня')
    pause()

    expect(said).toEqual([{ text: 'Посмотри почту за сегодня', language: 'ru' }])
  })

  it('drops backchannel only while the agent is busy', () => {
    const busy = desk(true)

    busy.subject.turn(turn('EndOfTurn', 'угу'))
    busy.pause()
    expect(busy.said).toEqual([])
  })

  it('drops one or two unsure words as noise', () => {
    const { subject, said, pause } = desk()

    subject.turn(turn('EndOfTurn', 'эм', 0.3))
    pause()

    expect(said).toEqual([])
  })

  it('keeps the language of the last line for a short one', () => {
    const { subject, said, pause } = desk()

    subject.turn(turn('EndOfTurn', 'Show my meetings for tomorrow', 0.95, ['en']))
    pause()
    subject.turn(turn('EndOfTurn', 'да', 0.95, ['ru']))
    pause()

    expect(said.map((utterance) => utterance.language)).toEqual(['en', 'en'])
  })

  it('flushes what waits when the call ends', () => {
    const { subject, said, timers } = desk()

    subject.turn(turn('EndOfTurn', 'Спасибо'))
    subject.flush()

    expect(said).toEqual([{ text: 'Спасибо', language: 'ru' }])
    expect(timers).toHaveLength(0)
  })
})

describe('pickLanguage', () => {
  /** Реплика владельца из звонка 2026-11-21: Flux дал ей язык pt. */
  const RUSSIAN_LINE =
    'Ok, a теперь посмотри за последние десять минут в WhatsApp были какие-нибудь сообщения?'

  it('always gives the chosen language outside multi mode', () => {
    expect(pickLanguage('ru', ['en'], 'Show me the meetings for tomorrow', null)).toBe('ru')
  })

  it('takes the words of a Russian line over the Portuguese label Flux gave it', () => {
    expect(pickLanguage('multi', ['pt'], RUSSIAN_LINE, 'ru')).toBe('ru')
    expect(pickLanguage('multi', ['pt', 'ru'], RUSSIAN_LINE, null)).toBe('ru')
  })

  it('leaves Latin lines the words do not settle to the Flux label', () => {
    expect(pickLanguage('multi', ['xx', 'es', 'en'], 'Busca los correos', 'ru')).toBe('es')
    expect(pickLanguage('multi', ['pt'], 'Procura emails novos hoje', 'ru')).toBe('pt')
  })

  it('takes clear Latin words over a wrong label', () => {
    expect(pickLanguage('multi', ['pt'], 'What is on my calendar for tomorrow?', 'ru')).toBe('en')
  })

  it('keeps the language of the last line for a short one', () => {
    expect(pickLanguage('multi', ['en'], "I'm asking.", 'ru')).toBe('ru')
  })
})

describe('judgeBargeIn', () => {
  const spoken = 'Сейчас посмотрю твой календарь на завтра'

  it('stops on a stop word at any level, even button only', () => {
    expect(judgeBargeIn('button', turn('Update', 'стоп'), spoken)).toBe('stop')
    expect(judgeBargeIn('low', turn('Update', 'Wait'), spoken)).toBe('stop')
  })

  it('does not stop for backchannel or the echo of its own words', () => {
    expect(judgeBargeIn('high', turn('Update', 'угу'), spoken)).toBe('wait')
    expect(judgeBargeIn('high', turn('Update', 'твой календарь'), spoken)).toBe('wait')
  })

  it('counts words and confidence by level', () => {
    expect(judgeBargeIn('high', turn('StartOfTurn', 'Нет'), spoken)).toBe('stop')
    expect(judgeBargeIn('medium', turn('Update', 'Нет', 0.7), spoken)).toBe('wait')
    expect(judgeBargeIn('medium', turn('Update', 'Нет', 0.9), spoken)).toBe('stop')
    expect(judgeBargeIn('medium', turn('Update', 'Не надо', 0.6), spoken)).toBe('stop')
    expect(judgeBargeIn('low', turn('Update', 'Не надо', 0.9), spoken)).toBe('wait')
    expect(judgeBargeIn('low', turn('Update', 'Не надо так', 0.75), spoken)).toBe('stop')
    expect(judgeBargeIn('button', turn('Update', 'Не надо так'), spoken)).toBe('ignore')
  })
})

describe('voice words', () => {
  it('knows backchannel, stop words and echo', () => {
    expect(isBackchannel('Да-да, понятно.')).toBe(true)
    expect(isBackchannel('да покажи')).toBe(false)
    expect(hasStopWord('Подожди, не то')).toBe(true)
    expect(hasStopWord('я не говорил стоп вообще')).toBe(false)
    expect(isStopOnly('Стоп, подожди')).toBe(true)
    expect(isStopOnly('Стоп, покажи только первую')).toBe(false)
    expect(isEcho('КАЛЕНДАРЬ на', 'твой календарь на завтра')).toBe(true)
    expect(isEcho('', 'что угодно')).toBe(false)
  })
})
