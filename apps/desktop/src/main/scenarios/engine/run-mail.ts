import type { RunNote } from '@shared/scenario-runs'
import type { HeadSettings } from '@shared/scenarios'

import type { FenceVerdict } from './head-fence'

/**
 * Слова человека голове (HeadMail в ACC), вопросы карточек (CardQuestion) и правила головы,
 * доделывающей карточку сама (TakeOver). Чистые функции, с тестом.
 */

/** Сколько слов человека держать в заметке. */
export const TOLD_CHARS = 8000

/** Когда голова читает слова человека. */
export type MailWay = 'now' | 'intoWork' | 'later'

/**
 * Свободна (карточка работает, вопрос ждёт человека, пауза) - отдельным ходом сразу. Отвечает
 * на вопрос прогона - ждать: её ход обязан кончиться объектом. Доделывает карточку - прямо в
 * идущий ход: он бывает часом, а слова чаще всего про эту самую работу.
 */
export const mailWay = (state: {
  headUp: boolean
  turnOpen: boolean
  answeringPerson: boolean
  doingCardWork: boolean
  waitingOnOthers: boolean
}): MailWay => {
  if (!state.headUp || state.answeringPerson) return 'later'
  if (state.doingCardWork && state.turnOpen) return 'intoWork'

  return !state.turnOpen && state.waitingOnOthers ? 'now' : 'later'
}

/** Слова человека, ещё не дошедшие до головы, старые первыми. */
export const waitingNotes = (notes: readonly RunNote[]): RunNote[] =>
  notes
    .filter((note) => note.who === 'person' && note.deliveredAt === 0)
    .sort((a, b) => a.at - b.at)

export const markDelivered = (
  notes: readonly RunNote[],
  which: readonly RunNote[],
  now: number,
): RunNote[] => {
  const stamps = new Set(which.map((note) => note.at))

  return notes.map((note) =>
    note.who === 'person' && stamps.has(note.at) ? { ...note, deliveredAt: now } : note,
  )
}

export const markUndelivered = (
  notes: readonly RunNote[],
  stamps: readonly number[],
): RunNote[] => {
  const wanted = new Set(stamps)

  return notes.map((note) =>
    note.who === 'person' && wanted.has(note.at) ? { ...note, deliveredAt: 0 } : note,
  )
}

/** Штамп заметки: свой у каждой, даже в ту же миллисекунду - по нему их и различают. */
export const noteStamp = (notes: readonly RunNote[], now: number): number =>
  Math.max(now, (notes.reduce((max, note) => Math.max(max, note.at), 0) || 0) + 1)

/** Чипы поля для показа - без байтов картинок: запись уходит на каждый экран. */
export const shownTokens = (tokens: unknown): unknown => {
  if (!Array.isArray(tokens)) return undefined

  return tokens.flatMap((token: unknown) => {
    if (typeof token !== 'object' || token === null) return []

    const one = token as Record<string, unknown>
    const chip = one['chip']

    if (typeof chip !== 'object' || chip === null) return [one]

    const { data: _data, ...rest } = chip as Record<string, unknown>

    return [{ ...one, chip: rest }]
  })
}

/** Вопрос карточки, как его разбирает движок. */
export type CardAsk = {
  requestId: string
  toolName: string
  input: Record<string, unknown>
  description: string
}

export const ASK_TOOL = 'AskUserQuestion'

const questionsOf = (ask: CardAsk): Record<string, unknown>[] => {
  const list = ask.input['questions']

  return Array.isArray(list)
    ? list.filter((one): one is Record<string, unknown> => typeof one === 'object' && one !== null)
    : []
}

const labelsOf = (question: Record<string, unknown>): string[] => {
  const options = question['options']

  return Array.isArray(options)
    ? options.flatMap((option: unknown) => {
        const label = (option as Record<string, unknown> | null)?.['label']

        return typeof label === 'string' ? [label] : []
      })
    : []
}

const field = (input: Record<string, unknown>, name: string): string =>
  typeof input[name] === 'string' ? input[name] : ''

/** О чём спрашивает: вопрос словами, команда, файл или описание CLI. */
export const askTitle = (ask: CardAsk): string => {
  if (ask.toolName === ASK_TOOL) {
    const question = questionsOf(ask)[0]?.['question']

    return typeof question === 'string' ? question : ''
  }

  const target =
    field(ask.input, 'command') ||
    field(ask.input, 'file_path') ||
    field(ask.input, 'notebook_path') ||
    field(ask.input, 'url') ||
    field(ask.input, 'pattern')

  return (target.split('\n')[0] ?? '') || ask.description
}

/** Варианты ответа у вопроса словами. */
export const askOptions = (ask: CardAsk): string[] =>
  ask.toolName === ASK_TOOL ? labelsOf(questionsOf(ask)[0] ?? {}) : []

/**
 * Ответ на вопрос с вариантами - под `answers` во входе вызова, как это делает панель:
 * голым ключом CLI его не видит и спрашивает заново. Набранная руками метка обязана совпасть
 * с вариантом, иначе уедет ответом своими словами. null - это разрешение, а не вопрос.
 */
export const askAnswers = (ask: CardAsk, text: string): Record<string, string> | null => {
  if (ask.toolName !== ASK_TOOL) return null

  const said = text.trim()
  const answers: Record<string, string> = {}

  for (const question of questionsOf(ask)) {
    const label = typeof question['question'] === 'string' ? question['question'] : ''

    if (!label) continue

    const labels = labelsOf(question)
    const lower = said.toLowerCase()

    answers[label] =
      labels.find((one) => one.toLowerCase() === lower) ??
      labels.find((one) => lower.includes(one.toLowerCase())) ??
      said
  }

  return Object.keys(answers).length > 0 ? answers : null
}

/** Отдать ли карточку голове: так настроено, ещё не отдавали, и голова не сказала «стоп». */
export const takeOverWanted = (head: HeadSettings, alreadyTaken: boolean, stopAsked: boolean) =>
  head.onGiveUp === 'head' && !alreadyTaken && !stopAsked

const NOBODY_TO_ASK =
  'Nobody is here to answer: you are the one who decides in this run. Decide it by the briefing and carry on.'

const NOT_WITHOUT_A_PERSON =
  'This scenario leaves anything its trust does not cover to a person, and nobody is here to grant it. Do what the trust allows, and if the card cannot be finished without this, answer that it is not done.'

/** Вопрос головы, доделывающей карточку: решает она сама, вопрос словами - некому ответить. */
export const takeOverVerdict = (head: HeadSettings, toolName: string): FenceVerdict => {
  if (toolName === ASK_TOOL) return { ok: false, why: NOBODY_TO_ASK }
  if (head.onQuestion === 'stop') return { ok: false, why: NOT_WITHOUT_A_PERSON }

  return { ok: true, why: '' }
}
