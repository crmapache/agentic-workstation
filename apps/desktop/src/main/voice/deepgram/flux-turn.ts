/**
 * Ход Flux STT (`TurnInfo` на `/v2/listen`): начало реплики, обновление текста, конец. Поля -
 * как их отдаёт Deepgram (справочник listen-flux, ноябрь 2026), в именах IDE.
 */
export type FluxTurnEvent = 'StartOfTurn' | 'Update' | 'EagerEndOfTurn' | 'TurnResumed' | 'EndOfTurn'

export type FluxWord = { word: string; confidence: number }

export type FluxTurn = {
  event: FluxTurnEvent
  turnIndex: number
  transcript: string
  words: FluxWord[]
  /** Языки реплики по убыванию числа слов; есть только у `flux-general-multi`. */
  languages: string[]
}

const EVENTS: readonly FluxTurnEvent[] = [
  'StartOfTurn',
  'Update',
  'EagerEndOfTurn',
  'TurnResumed',
  'EndOfTurn',
]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const wordOf = (value: unknown): FluxWord | null =>
  isRecord(value) && typeof value['word'] === 'string'
    ? {
        word: value['word'],
        confidence: typeof value['confidence'] === 'number' ? value['confidence'] : 0,
      }
    : null

/** Сообщение Flux в ход; не ход (Connected, Warning) или незнакомое событие - null. */
export const parseFluxTurn = (message: unknown): FluxTurn | null => {
  if (!isRecord(message) || message['type'] !== 'TurnInfo') return null

  const event = EVENTS.find((known) => known === message['event'])

  if (!event) return null

  return {
    event,
    turnIndex: typeof message['turn_index'] === 'number' ? message['turn_index'] : 0,
    transcript: typeof message['transcript'] === 'string' ? message['transcript'] : '',
    words: Array.isArray(message['words'])
      ? message['words'].map(wordOf).filter((word) => word !== null)
      : [],
    languages: Array.isArray(message['languages'])
      ? message['languages'].filter((language) => typeof language === 'string')
      : [],
  }
}

/** Средняя уверенность слов хода; слов нет - 0. */
export const confidenceOf = (words: readonly FluxWord[]): number =>
  words.length === 0 ? 0 : words.reduce((sum, word) => sum + word.confidence, 0) / words.length
