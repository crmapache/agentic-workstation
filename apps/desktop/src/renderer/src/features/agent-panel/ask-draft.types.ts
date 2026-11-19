/**
 * Собираемые ответы на вопрос с вариантами, по номеру вопроса. custom: нет записи -
 * «Other» выключен, пустая строка - открыт, но ничего не набрано.
 */
export type AskDraft = {
  picks: Record<number, string[]>
  custom: Record<number, string>
}
