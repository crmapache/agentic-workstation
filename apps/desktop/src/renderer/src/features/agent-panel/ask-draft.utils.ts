import type { Question, QuestionAnswers } from '@shared/conversation'
import type { DraftToken } from '@shared/message-draft'

import type { AskDraft } from './ask-draft.types'
import { tokenText, isPastedImage } from './draft.utils'

/**
 * Ответы на вопрос с вариантами, пока их собирают (как в ACC, feed/askDraft). Черновик
 * живёт вне карточки: карточку пересобирает смена вкладки, а собранные ответы пропадать
 * не должны. Вопрос - по номеру в запросе, вариант - по подписи (так ответ уходит CLI).
 */

export const EMPTY_ASK_DRAFT: AskDraft = { picks: {}, custom: {} }

const withoutOwn = (custom: AskDraft['custom'], index: number): AskDraft['custom'] => {
  if (custom[index] === undefined) return custom

  const { [index]: _gone, ...rest } = custom

  return rest
}

/**
 * Нажат вариант. Одиночный выбор заменяет ответ и закрывает «свой ответ»; множественный -
 * галочка туда-обратно, «свой ответ» там - такая же галочка рядом.
 */
export const togglePick = (
  draft: AskDraft,
  question: Question,
  index: number,
  label: string,
): AskDraft => {
  const selected = draft.picks[index] ?? []

  if (!question.multiSelect) {
    return { picks: { ...draft.picks, [index]: [label] }, custom: withoutOwn(draft.custom, index) }
  }

  const next = selected.includes(label)
    ? selected.filter((pick) => pick !== label)
    : [...selected, label]

  return { ...draft, picks: { ...draft.picks, [index]: next } }
}

/** «Other» включён: на его месте поле. Второе нажатие не стирает набранное. */
export const openOwnAnswer = (draft: AskDraft, question: Question, index: number): AskDraft => {
  if (draft.custom[index] !== undefined) return draft

  return {
    picks: question.multiSelect ? draft.picks : { ...draft.picks, [index]: [] },
    custom: { ...draft.custom, [index]: [] },
  }
}

export const writeOwnAnswer = (draft: AskDraft, index: number, tokens: DraftToken[]): AskDraft => ({
  ...draft,
  custom: { ...draft.custom, [index]: tokens },
})

/**
 * Свой ответ текстом для CLI. Ответ уходит только текстом, байтов картинки рядом нет: файл и
 * картинка - ссылкой «@путь», как в сообщении (вставленная картинка - путём, куда IDE её записала;
 * не записалась - ссылки нет). Остальные чипы - тем же текстом, что в сообщении.
 */
export const ownAnswerText = (tokens: readonly DraftToken[]): string =>
  tokens
    .map((token) => {
      if (token.kind === 'chip' && token.chip.kind === 'img') {
        const { chip } = token

        if (chip.path) return `@${chip.path}`
        if (isPastedImage(chip)) return ''
      }

      return tokenText(token)
    })
    .join('')

/** Ответ на один вопрос: свой текст важнее галочек, галочки - через запятую. */
export const answerFor = (draft: AskDraft, index: number): string =>
  ownAnswerText(draft.custom[index] ?? []).trim() || (draft.picks[index] ?? []).join(', ')

/** Все ли вопросы отвечены - можно отправлять. */
export const askAnswered = (questions: readonly Question[], draft: AskDraft): boolean =>
  questions.length > 0 && questions.every((_, index) => answerFor(draft, index).length > 0)

/** Первый неотвеченный после after; -1 - таких нет. Туда идут цифры. */
export const firstUnanswered = (
  questions: readonly Question[],
  draft: AskDraft,
  after = -1,
): number =>
  questions.findIndex((_, index) => index > after && answerFor(draft, index).length === 0)

/** Ответы для CLI по тексту вопроса. */
export const askAnswers = (questions: readonly Question[], draft: AskDraft): QuestionAnswers =>
  Object.fromEntries(
    questions.map((question, index) => [question.question, answerFor(draft, index)]),
  )
