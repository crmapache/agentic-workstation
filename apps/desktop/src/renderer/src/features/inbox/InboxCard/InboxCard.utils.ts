import { isInboxAsking } from '@shared/inbox'
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

/**
 * Своя тема уведомления - заголовок, который стоит строкой над сутью. У прогона заголовок - имя
 * задания, оно уже стоит строкой «от кого»; у отчёта и сбоя его нет. Пусто - своей темы нет.
 */
export const subjectOf = (item: InboxItem): string =>
  item.kind === 'report' || item.kind === 'failure' || item.title === item.source ? '' : item.title

/**
 * Раскрыта ли карточка, пока человек её не трогал: ждущая ответа (вопрос, разрешение, план) -
 * да, свёрнутая прятала бы то, на чём стоит прогон; остальное - одна шапка.
 */
export const expandedByDefault = (item: InboxItem): boolean => isInboxAsking(item)

/** Кнопки под содержимым: ответ на вопросы рисует свою часть. */
export const buttonsOf = (item: InboxItem) => item.actions.filter((one) => one.kind !== 'answer')
