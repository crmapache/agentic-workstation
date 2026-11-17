import type { InboxItem } from '@shared/inbox'

/** Слова закрытия, у которых есть свой текст; остальное - подпись нажатой кнопки как есть. */
const OUTCOME_WORDS = new Set(['dismissed', 'withdrawn', 'cancelled', 'answered'])

/** Чем закрыто: слово закрытия (i18n) или подпись кнопки (её вид - тоже через i18n). */
export const outcomeOf = (
  item: InboxItem,
):
  | { kind: 'word'; key: string }
  | { kind: 'action'; key: string }
  | { kind: 'text'; text: string } => {
  if (OUTCOME_WORDS.has(item.outcome)) return { kind: 'word', key: item.outcome }

  const pressed = item.actions.find((one) => one.kind === item.outcome && !one.label)

  return pressed ? { kind: 'action', key: pressed.kind } : { kind: 'text', text: item.outcome }
}

/** Кнопки под содержимым: ответ на вопросы рисует свою часть. */
export const buttonsOf = (item: InboxItem) => item.actions.filter((one) => one.kind !== 'answer')
