import type { DraftToken } from '@shared/message-draft'

/**
 * Собираемые ответы на вопрос с вариантами, по номеру вопроса. custom - свой ответ кусками, как
 * черновик поля сообщения (файлы и картинки - чипами): нет записи - «Other» выключен, пусто -
 * открыт, но ничего не набрано.
 */
export type AskDraft = {
  picks: Record<number, string[]>
  custom: Record<number, DraftToken[]>
}
