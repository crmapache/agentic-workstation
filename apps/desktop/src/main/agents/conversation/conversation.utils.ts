import { DRAFT_TITLE_CHARS } from './conversation.constants'

/** Команда CLI («/compact»): посреди хода CLI проглотил бы её как обычный текст. */
export const isSlashCommand = (text: string): boolean => /^\/[\w:.-]+/.test(text.trimStart())

/** Временный заголовок вкладки из первого сообщения: одна строка, обрезана по слову. */
export const draftTitle = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()

  if (flat.length <= DRAFT_TITLE_CHARS) return flat

  const cut = flat.slice(0, DRAFT_TITLE_CHARS)
  const space = cut.lastIndexOf(' ')

  return `${space > DRAFT_TITLE_CHARS / 2 ? cut.slice(0, space) : cut}…`
}
