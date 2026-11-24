import type { PendingOf } from './PendingCard.types'

const field = (input: unknown, key: string): string | null => {
  if (typeof input !== 'object' || input === null || !(key in input)) return null

  const value = (input as Record<string, unknown>)[key]

  return typeof value === 'string' ? value : null
}

/**
 * Команда вызова по виду действия (любой провайдер); у наблюдателя - его команда или адрес
 * сокета. null - вызов не команда или IDE постарше.
 */
const commandOf = (
  pending: PendingOf<'permission'>,
): { command: string; description: string } | null => {
  const { action } = pending

  if (action?.kind === 'monitor') {
    return { command: action.command || action.url, description: action.description }
  }

  return action?.kind === 'command' && typeof action.command === 'string' ? action : null
}

/**
 * Что разрешают - целиком, без обрезки: команда как есть, остальное - JSON. «Разрешить»
 * одобряет весь вызов, и хвост вроде «; curl … | sh» за безобидным началом должен быть виден.
 * Длинное прокручивается в своём блоке. Команда - по виду действия; IDE постарше его не шлёт -
 * по входу Bash.
 */
export const permissionDetail = (pending: PendingOf<'permission'>): string => {
  const command = pending.action ? commandOf(pending)?.command : field(pending.input, 'command')

  return command ?? JSON.stringify(pending.input, null, 2)
}

/**
 * Слова самой модели о вызове (описание команды): показываются отдельно и подписаны как её
 * слова - это объяснение, а не то, что выполнится.
 */
export const modelWords = (pending: PendingOf<'permission'>): string => {
  const words = pending.action
    ? commandOf(pending)?.description
    : field(pending.input, 'description')

  return words?.trim() ?? ''
}

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

/** Выбор варианта: один из многих - заменяет прежний, несколько - включает и выключает. */
export const pickOption = (current: readonly string[], label: string, multi: boolean): string[] =>
  multi
    ? current.includes(label)
      ? current.filter((one) => one !== label)
      : [...current, label]
    : [label]
