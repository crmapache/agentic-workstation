import type { PendingOf } from './PendingCard.types'

const field = (input: unknown, key: string): string | null => {
  if (typeof input !== 'object' || input === null || !(key in input)) return null

  const value = (input as Record<string, unknown>)[key]

  return typeof value === 'string' ? value : null
}

/**
 * Что разрешают - целиком, без обрезки: команда как есть, остальное - JSON. «Разрешить»
 * одобряет весь вызов, и хвост вроде «; curl … | sh» за безобидным началом должен быть виден.
 * Длинное прокручивается в своём блоке.
 */
export const permissionDetail = (pending: PendingOf<'permission'>): string =>
  field(pending.input, 'command') ?? JSON.stringify(pending.input, null, 2)

/**
 * Слова самой модели о вызове (поле description у Bash): показываются отдельно и подписаны как
 * её слова - это объяснение, а не то, что выполнится.
 */
export const modelWords = (pending: PendingOf<'permission'>): string =>
  field(pending.input, 'description')?.trim() ?? ''

/** Одобрить нельзя: IDE урезала вопрос или прислала его карточкой без входа. */
export const cannotReview = (pending: PendingOf<'permission'>): boolean =>
  pending.truncated || pending.input === null

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
