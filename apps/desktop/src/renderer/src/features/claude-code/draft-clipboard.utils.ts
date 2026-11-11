import type { DraftChip, DraftToken } from '@shared/claude-draft'
import { CHIP_KINDS } from '@shared/claude-draft'

import { tokensText } from './draft.utils'

/**
 * Поле ввода в буфере обмена. Модели вложение - «@путь» или «[Image #3]», а человек
 * уносит копию в задачу, чат, терминал: там нужен сам путь. Рядом с текстом в text/html
 * едет полное описание кусков с байтами картинок - из него при вставке чипы
 * восстанавливаются живыми, и после перезапуска IDE тоже.
 */

/** Метка своего содержимого в text/html буфера. */
export const CLIPBOARD_ATTRIBUTE = 'data-agentic-workstation-tokens'

/** Вложение в буфере: путь, а не подпись и не синтаксис поля. */
export const clipboardText = (token: DraftToken): string => {
  if (token.kind === 'text') return token.value

  const { chip } = token

  if (chip.kind === 'cmd') return `/${chip.value}`
  if (chip.kind === 'quote' || chip.kind === 'paste') return chip.text ?? ''
  if (chip.kind === 'ref') return chip.range ? `${chip.value} (${chip.range})` : chip.value
  // Байты из буфера: путь, куда их записали, а не записали - хотя бы номер.
  if (chip.data) return chip.path || `[${chip.value}]`

  return chip.value
}

export const clipboardTextOf = (tokens: readonly DraftToken[]): string =>
  tokens.map(clipboardText).join('')

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Что кладётся в text/html: описание кусков в атрибуте, читаемый текст внутри. Переносы
 * - <br>: в HTML перевод строки - пробел, и в редакторе или мессенджере сообщение
 * легло бы одним абзацем.
 */
export const clipboardHtml = (tokens: readonly DraftToken[]): string =>
  `<span style="white-space:pre-wrap" ${CLIPBOARD_ATTRIBUTE}="${encodeURIComponent(JSON.stringify(tokens))}">${escapeHtml(tokensText(tokens)).replace(/\n/g, '<br>')}</span>`

const DATA_URL = /^data:image\/[\w+.-]+;base64,[A-Za-z0-9+/]+=*$/

const isChip = (value: unknown): value is DraftChip => {
  if (typeof value !== 'object' || value === null) return false

  const chip = value as Record<string, unknown>
  const fields = ['range', 'data', 'path', 'text'] as const

  if (typeof chip['value'] !== 'string') return false
  if (!CHIP_KINDS.some((kind) => kind === chip['kind'])) return false
  if (fields.some((field) => chip[field] !== undefined && typeof chip[field] !== 'string')) {
    return false
  }

  // Картинка с нечитаемыми байтами - сломана: вложения не будет, а чип бы его обещал.
  return chip['data'] === undefined || DATA_URL.test(chip['data'] as string)
}

const isToken = (value: unknown): value is DraftToken => {
  if (typeof value !== 'object' || value === null) return false

  const token = value as Record<string, unknown>

  return token['kind'] === 'text'
    ? typeof token['value'] === 'string'
    : token['kind'] === 'chip' && isChip(token['chip'])
}

/** Свои куски обратно из буфера; чужое или битое - null, вставка пойдёт простым текстом. */
export const clipboardTokens = (html: string): DraftToken[] | null => {
  const match = new RegExp(`${CLIPBOARD_ATTRIBUTE}="([^"]*)"`).exec(html)

  if (!match?.[1]) return null

  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(match[1]))

    return Array.isArray(parsed) && parsed.length > 0 && parsed.every(isToken) ? parsed : null
  } catch {
    return null
  }
}
