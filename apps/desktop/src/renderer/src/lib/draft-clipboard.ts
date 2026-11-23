import type { DraftToken } from '@shared/message-draft'

/**
 * Куски поля ввода чата в буфере обмена: рядом с текстом в text/html едет полное описание кусков,
 * и вставка в поле чата IDE возвращает чипы живыми. Кладут их и само поле (копия набранного), и
 * другие части окна (ссылка на карточку трекера, ADR 0113).
 */

/** Метка своего содержимого в text/html буфера. */
export const CLIPBOARD_ATTRIBUTE = 'data-agentic-workstation-tokens'

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Что кладётся в text/html: описание кусков в атрибуте, читаемый текст внутри. Переносы
 * - <br>: в HTML перевод строки - пробел, и в редакторе или мессенджере сообщение
 * легло бы одним абзацем.
 */
export const tokensHtml = (tokens: readonly DraftToken[], readable: string): string =>
  `<span style="white-space:pre-wrap" ${CLIPBOARD_ATTRIBUTE}="${encodeURIComponent(JSON.stringify(tokens))}">${escapeHtml(readable).replace(/\n/g, '<br>')}</span>`

/** Куски в буфер вне события копирования (пункт меню): текстом для чужих мест и html для поля. */
export const copyTokens = (tokens: readonly DraftToken[], plain: string): Promise<void> =>
  navigator.clipboard.write([
    new ClipboardItem({
      'text/plain': new Blob([plain], { type: 'text/plain' }),
      'text/html': new Blob([tokensHtml(tokens, plain)], { type: 'text/html' }),
    }),
  ])
