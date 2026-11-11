import type { ImageMediaType, ImageAttachment } from '@shared/claude'
import { IMAGE_MEDIA_TYPES } from '@shared/claude'
import type { DraftChip, DraftQuote, DraftToken, MessageDraft } from '@shared/claude-draft'

import type { ComposerDraft } from './draft.types'

/**
 * Что черновик поля значит для модели: текст с вложениями на своих местах, цитаты
 * строками «> » сверху, картинки - вложением, пронумерованные через весь разговор (как
 * в ACC). Правила ломаются молча - их держит тест.
 */

/** Пустой черновик: ни слова, ни вложения, ни цитаты. */
export const EMPTY_DRAFT: ComposerDraft = { tokens: [], quotes: [] }

/** Подпись вставленной картинки - «Image #N», та же, что модель видит в тексте. */
const PASTED_CAPTION = /^Image #\d+$/

/** Вставленная картинка: едет байтами рядом с текстом, а не путём. */
export const isPastedImage = (chip: DraftChip): boolean =>
  chip.kind === 'img' && (Boolean(chip.data) || PASTED_CAPTION.test(chip.value))

const hasBytes = (token: DraftToken): boolean =>
  token.kind === 'chip' && token.chip.kind === 'img' && Boolean(token.chip.data)

/** Склеится ли дописанное с этим текстом: в конце не пробел. */
export const endsOpen = (text: string): boolean => text.length > 0 && !/\s$/.test(text)

/**
 * Ограда блока кода - длиннее любой серии обратных кавычек в тексте: иначе кусок Markdown с
 * блоком внутри закрыл бы её сам.
 */
export const fenceFor = (text: string): string =>
  '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((run) => run[0].length + 1)))

/**
 * Кусок файла: путь через «@», как в терминале, и строки в скобках. С текстом («Send to Chat»
 * из редактора) - за ними сам выделенный кусок блоком кода: модели едет ровно он, а не строки
 * целиком. Блок кончается переводом строки - слова после чипа идут уже под ним.
 */
export const referenceText = (chip: DraftChip): string => {
  const place = chip.range ? `@${chip.value} (${chip.range})` : `@${chip.value}`

  if (chip.text === undefined || !chip.range) return place

  const fence = fenceFor(chip.text)

  return `${place}:\n${fence}\n${chip.text}\n${fence}\n`
}

/** Вложение внутри строки - ровно то, что модель увидит на его месте. */
export const tokenText = (token: DraftToken): string => {
  if (token.kind === 'text') return token.value

  const { chip } = token

  if (chip.kind === 'cmd') return `/${chip.value}`
  if (chip.kind === 'ref') return referenceText(chip)
  // Цитата - не путь, а сам текст: модель получает её целиком, а не начало с чипа.
  if (chip.kind === 'quote') return `"${chip.text ?? ''}"`
  // Свёрнутая вставка - ровно вставленный текст: свёрнута она только на экране.
  if (chip.kind === 'paste') return chip.text ?? ''
  // Картинка без байтов выбрана файлом - обычная ссылка, которую модель прочтёт.
  return `@${chip.value}`
}

/**
 * Текст кусков с пронумерованными картинками. Номер считается по месту в кусках, а не
 * берётся с чипа: картинку могли вставить перед уже вставленной, а байты уходят в
 * порядке кусков. Счёт - с offset: столько картинок уже ушло в этом разговоре.
 */
export const tokensText = (tokens: readonly DraftToken[], offset = 0): string => {
  let ordinal = offset

  return tokens
    .map((token) => {
      if (!hasBytes(token)) return tokenText(token)

      ordinal += 1

      return `[Image #${ordinal}]`
    })
    .join('')
}

/** Только набранный текст, без вложений. */
export const plainText = (tokens: readonly DraftToken[]): string =>
  tokens.map((token) => (token.kind === 'text' ? token.value : '')).join('')

/**
 * Пустой хвост (пробелы и переносы) - прочь: последняя строка поля места не занимает и
 * не видна, а в ленте встала бы лишней пустой строкой.
 */
export const trimTrailingSpace = (tokens: readonly DraftToken[]): DraftToken[] => {
  const trimmed = [...tokens]

  for (let last = trimmed.at(-1); last?.kind === 'text'; last = trimmed.at(-1)) {
    const value = last.value.trimEnd()

    trimmed.pop()

    if (value) return [...trimmed, { kind: 'text', value }]
  }

  return trimmed
}

/** Сообщение целиком: цитаты строками сверху, поле - под ними. */
export const composePrompt = (draft: ComposerDraft, imageOffset: number): string => {
  const body = tokensText(draft.tokens, imageOffset).trim()

  return [...draft.quotes.map((quote) => `> ${quote.text}`), ...(body ? [body] : [])].join('\n')
}

const DATA_URL = /^data:([^;]+);base64,(.+)$/

const isMediaType = (type: string): type is ImageMediaType =>
  IMAGE_MEDIA_TYPES.some((allowed) => allowed === type)

/** Байты вставленных картинок - то, что правда едет модели вложением, в порядке кусков. */
export const imageAttachments = (tokens: readonly DraftToken[]): ImageAttachment[] =>
  tokens.flatMap((token) => {
    if (token.kind !== 'chip' || !token.chip.data) return []

    const match = DATA_URL.exec(token.chip.data)
    const mediaType = match?.[1] ?? ''

    return match?.[2] && isMediaType(mediaType) ? [{ mediaType, data: match[2] }] : []
  })

/** Куски для ленты и очереди: байты картинок остаются здесь, главный процесс держит свои. */
export const messageDraftOf = (draft: ComposerDraft): MessageDraft => ({
  tokens: draft.tokens.map((token) => {
    if (token.kind !== 'chip' || !token.chip.data) return token

    const { data: _bytes, ...chip } = token.chip

    return { kind: 'chip', chip }
  }),
  quotes: draft.quotes.map((quote) => quote.text),
})

/** Есть ли что слать: слово, вложение или цитата. */
export const hasContent = (draft: ComposerDraft): boolean =>
  draft.quotes.length > 0 ||
  draft.tokens.some((token) => token.kind === 'chip' || token.value.trim().length > 0)

/** Вложение в конец кусков - с пробелом с обеих сторон, чтобы не слиплось со словами. */
export const appendChip = (tokens: readonly DraftToken[], chip: DraftChip): DraftToken[] => {
  const last = tokens.at(-1)
  const gap: DraftToken[] =
    last?.kind === 'text' && endsOpen(last.value) ? [{ kind: 'text', value: ' ' }] : []

  return [...tokens, ...gap, { kind: 'chip', chip }, { kind: 'text', value: ' ' }]
}

/** Цитаты обратно из строк (вынутое из очереди, возврат отправленного). */
export const quotesOf = (texts: readonly string[], now = Date.now()): DraftQuote[] =>
  texts.map((text, index) => ({ id: `q-${now}-${index}`, text }))

/** Сколько вставленных картинок уже ушло в разговоре: с них продолжается нумерация. */
export const countImages = (tokens: readonly DraftToken[]): number => tokens.filter(hasBytes).length
