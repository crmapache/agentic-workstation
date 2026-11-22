import { describe, expect, it } from 'vitest'

import type { FluxTurn } from '../deepgram/flux-turn'
import { judgeBargeIn } from './barge-in'
import type { Utterance } from './utterances'
import { UtteranceDesk, pickLanguage } from './utterances'
import { hasStopWord, isBackchannel, isEcho } from './voice-words'

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
  const timers: Array<() => void> = []
  const subject = new UtteranceDesk({
    mode: 'multi',
    timer: (run) => {
      timers.push(run)

      return () => timers.splice(timers.indexOf(run), 1)
    },
    onHeard: (text) => heard.push(text),
    onUtterance: (utterance) => said.push(utterance),
    isAgentBusy: () => busy,
  })

  return { subject, heard, said, timers }
}

describe('UtteranceDesk', () => {
  it('sends a finished line with its language and shows the live text before it', () => {
    const { subject, heard, said } = desk()

    subject.turn(turn('StartOfTurn', 'Посмотри'))
    subject.turn(turn('EndOfTurn', 'Посмотри встречи на завтра'))

    expect(heard).toEqual(['Посмотри', ''])
    expect(said).toEqual([{ text: 'Посмотри встречи на завтра', language: 'ru' }])
  })

  it('glues a short line to the next one when the person goes on', () => {
    const { subject, said, timers } = desk()

    subject.turn(turn('EndOfTurn', 'Привет.'))
    expect(said).toEqual([])
    expect(timers).toHaveLength(1)

    subject.turn(turn('StartOfTurn', 'Посмотри'))
    expect(timers).toHaveLength(0)
    subject.turn(turn('EndOfTurn', 'Посмотри встречи на завтра.'))

    expect(said).toEqual([{ text: 'Привет. Посмотри встречи на завтра.', language: 'ru' }])
  })

  it('sends a short line alone when nothing follows', () => {
    const { subject, said, timers } = desk()

    subject.turn(turn('EndOfTurn', 'Да.'))
    timers[0]?.()

    expect(said).toEqual([{ text: 'Да.', language: 'ru' }])
  })

  it('drops backchannel only while the agent is busy', () => {
    const busy = desk(true)

    busy.subject.turn(turn('EndOfTurn', 'угу'))
    busy.timers[0]?.()
    expect(busy.said).toEqual([])
  })

  it('drops one or two unsure words as noise', () => {
    const { subject, said, timers } = desk()

    subject.turn(turn('EndOfTurn', 'эм', 0.3))
    timers[0]?.()

    expect(said).toEqual([])
  })

  it('keeps the language of the last line for a short one', () => {
    const { subject, said, timers } = desk()

    subject.turn(turn('EndOfTurn', 'Show my meetings for tomorrow', 0.95, ['en']))
    subject.turn(turn('EndOfTurn', 'да', 0.95, ['ru']))
    timers[0]?.()

    expect(said.map((utterance) => utterance.language)).toEqual(['en', 'en'])
  })

  it('flushes what waits when the call ends', () => {
    const { subject, said } = desk()

    subject.turn(turn('EndOfTurn', 'Спасибо'))
    subject.flush()

    expect(said).toEqual([{ text: 'Спасибо', language: 'ru' }])
  })
})

describe('pickLanguage', () => {
  it('always gives the chosen language outside multi mode', () => {
    expect(pickLanguage('ru', ['en'], 10, null)).toBe('ru')
  })

  it('takes the first known language of a long line', () => {
    expect(pickLanguage('multi', ['xx', 'es', 'en'], 5, 'ru')).toBe('es')
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
    expect(isEcho('КАЛЕНДАРЬ на', 'твой календарь на завтра')).toBe(true)
    expect(isEcho('', 'что угодно')).toBe(false)
  })
})
