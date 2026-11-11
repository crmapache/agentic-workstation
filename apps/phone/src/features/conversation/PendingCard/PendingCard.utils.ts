import type { PendingOf } from './PendingCard.types'

/** Что разрешают - читаемо: команда как есть, остальное - JSON, длинное обрезано. */
export const permissionDetail = (pending: PendingOf<'permission'>, limit = 1200): string => {
  const input = pending.input
  const command =
    typeof input === 'object' && input !== null && 'command' in input ? input.command : null
  const raw = typeof command === 'string' ? command : JSON.stringify(input, null, 2)

  return raw.length > limit ? `${raw.slice(0, limit)}\n…` : raw
}

/**
 * Ответы на вопросы с вариантами - как их ждёт CLI: по тексту вопроса выбранные подписи через
 * запятую или свой текст. Свой текст важнее выбора.
 */
export const questionAnswers = (
  questions: PendingOf<'question'>['questions'],
  picked: Record<number, string[]>,
  own: Record<number, string>,
): Record<string, string> =>
  Object.fromEntries(
    questions.map((question, index) => [
      question.question,
      own[index]?.trim() || (picked[index] ?? []).join(', '),
    ]),
  )

/** Ответ есть на каждый вопрос - можно отправлять. */
export const allAnswered = (answers: Record<string, string>): boolean =>
  Object.values(answers).every((answer) => answer !== '')
