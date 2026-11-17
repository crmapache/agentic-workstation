import type { Question, QuestionAnswers } from '@shared/claude'
import type { InboxItem, InboxState } from '@shared/inbox'
import { isInboxOpen, isInboxAsking, isInboxScheduled } from '@shared/inbox'

import { PREVIEW_MAX } from './inbox.constants'
import type { InboxTab } from './inbox.types'

/** Уведомления вкладки: входящие и закрытые - новые первыми, запланированные - ближние первыми. */
export const itemsOf = (state: InboxState | undefined, tab: InboxTab): InboxItem[] => {
  const items = state?.items ?? []

  if (tab === 'open') return items.filter((item) => isInboxOpen(item))
  if (tab === 'done') return items.filter((item) => item.doneAt !== 0)

  return items
    .filter((item) => isInboxScheduled(item))
    .sort((left, right) => left.deliverAt - right.deliverAt)
}

export const tabCounts = (state: InboxState | undefined): Record<InboxTab, number> => ({
  open: itemsOf(state, 'open').length,
  scheduled: itemsOf(state, 'scheduled').length,
  done: itemsOf(state, 'done').length,
})

/**
 * Ответ на вопросы AskUserQuestion: своё слово главнее выбранного, выбранные варианты - через
 * запятую, как это делает панель. null - на какой-то вопрос ответа нет.
 */
export const answersOf = (
  questions: readonly Question[],
  picks: Record<string, string[]>,
  own: Record<string, string>,
): QuestionAnswers | null => {
  const answers: QuestionAnswers = {}

  for (const { question } of questions) {
    const said = own[question]?.trim() ?? ''
    const picked = picks[question] ?? []
    const answer = said || picked.join(', ')

    if (!answer) return null

    answers[question] = answer
  }

  return answers
}

/** Выбор варианта: у вопроса с одним ответом - замена, с несколькими - переключение. */
export const togglePick = (current: readonly string[], label: string, multi: boolean) => {
  if (!multi) return [label]

  return current.includes(label) ? current.filter((one) => one !== label) : [...current, label]
}

/** Суть уведомления одной строкой - для карточки в углу окна. */
export const previewOf = (item: InboxItem): string => {
  const said =
    item.kind === 'question'
      ? (item.questions[0]?.question ?? '')
      : item.kind === 'permission'
        ? [item.tool, item.detail].filter(Boolean).join(': ')
        : item.body
  // Разметку Markdown - прочь, но «#12» в тексте - не заголовок: решётка уходит только в начале строки.
  const line = said
    .replace(/^\s*#+\s*/gm, '')
    .replace(/[`*_>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return line.length > PREVIEW_MAX ? `${line.slice(0, PREVIEW_MAX - 1)}…` : line
}

/** Ответить можно сразу нажатием варианта: один вопрос, один ответ. */
export const answersAtOnce = (questions: readonly Question[]): boolean =>
  questions.length === 1 && questions[0]?.multiSelect === false

/** Заголовок карточки угла: от кого и о чём («Invoice: Ready to send»), без повтора. */
export const toastTitleOf = (item: Pick<InboxItem, 'source' | 'title'>): string =>
  item.source && item.source !== item.title ? `${item.source}: ${item.title}` : item.title

/** Прочитанные открытые без вопроса - их закрывает «Dismiss read» разом. */
export const readOf = (items: readonly InboxItem[]): string[] =>
  items.filter((item) => item.readAt !== 0 && !isInboxAsking(item)).map((item) => item.id)
