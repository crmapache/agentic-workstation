import type { DraftChip, DraftToken, MessageDraft } from '@shared/claude-draft'

import {
  REPLAY_RANGE,
  QUOTATION_MIN,
  REPLAY_COMMAND,
  REPLAY_SNIPPET,
  REPLAY_TRAILING,
  REPLAY_QUOTATION,
  REPLAY_ATTACHMENT,
  PICTURE_EXTENSIONS,
} from './message.constants'

/**
 * Сообщение человека, прочитанное обратно из текста (транскрипт, другой клиент): поле
 * отправляет чипы одной строкой для модели, и без разбора разговор из истории читался
 * бы стеной «@путей» и «[Image #2]». Узнаётся только то, что поле пишет само и что не
 * спутать с набранным руками; кавычки - только если слова внутри уже сказал агент в
 * этом разговоре (как в ACC).
 */

/** Картинка по расширению, иначе файл; слеш на конце - папка. */
export const kindOfPath = (path: string): DraftChip['kind'] => {
  if (path.endsWith('/')) return 'dir'

  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()

  return PICTURE_EXTENSIONS.has(extension) ? 'img' : 'file'
}

/** Путь узнаётся по папке внутри или расширению: «@media», «@Override» - не пути. */
const isPath = (value: string): boolean => value.includes('/') || /\.[A-Za-z0-9]{1,8}$/.test(value)

/** Строки «> » сверху - цитаты над полем: первая обычная строка кончает блок. */
const takeQuotedLines = (text: string): { quotes: string[]; body: string } => {
  const lines = text.split('\n')
  const quotes: string[] = []

  while (lines[0]?.startsWith('> ')) quotes.push((lines.shift() ?? '').slice(2))

  return { quotes, body: lines.join('\n') }
}

/** Слова без разметки, тире и маркеров списка: цитату брали с экрана, ответ - markdown. */
const normalise = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[`*_#>\-‐-―•·\s]+/g, ' ')
    .trim()

/** Есть ли в тексте кавычки, которые могут оказаться цитатой ответа. */
export const hasQuotation = (text: string): boolean =>
  [...text.matchAll(REPLAY_QUOTATION)].some(
    (match) => (match[1] ?? '').trim().length >= QUOTATION_MIN,
  )

type Piece = { text: string; quotation: boolean }

const splitQuotations = (text: string): Piece[] => {
  const pieces: Piece[] = []
  let at = 0

  for (const match of text.matchAll(REPLAY_QUOTATION)) {
    const inner = match[1] ?? ''

    if (inner.trim().length < QUOTATION_MIN) continue

    if (match.index > at) pieces.push({ text: text.slice(at, match.index), quotation: false })
    pieces.push({ text: inner, quotation: true })
    at = match.index + match[0].length
  }

  if (at < text.length) pieces.push({ text: text.slice(at), quotation: false })

  return pieces
}

const chipToken = (chip: DraftChip): DraftToken => ({ kind: 'chip', chip })

/** «@путь», «@путь (L12-L18)» и «[Image #N]» - то, что пишет поле. */
const attachmentTokens = (text: string): DraftToken[] => {
  const tokens: DraftToken[] = []
  let at = 0

  for (const match of text.matchAll(REPLAY_ATTACHMENT)) {
    const found = match[0]
    const start = match.index

    if (found.startsWith('[Image')) {
      tokens.push(
        { kind: 'text', value: text.slice(at, start) },
        chipToken({ kind: 'img', value: found.slice(1, -1) }),
      )
      at = start + found.length
      continue
    }

    const path = found.slice(1).replace(REPLAY_TRAILING, '')

    if (!isPath(path)) continue

    const range = REPLAY_RANGE.exec(text.slice(start + 1 + path.length))
    const chip: DraftChip = range?.[1]
      ? { kind: 'ref', value: path, range: range[1] }
      : { kind: kindOfPath(path), value: path }

    tokens.push({ kind: 'text', value: text.slice(at, start) }, chipToken(chip))
    at = start + 1 + path.length + (range ? range[0].length : 0)
  }

  tokens.push({ kind: 'text', value: text.slice(at) })

  return tokens
}

/** Соседние куски текста - в один, пустые - прочь: в карточке они встали бы зазорами. */
const merge = (tokens: readonly DraftToken[]): DraftToken[] => {
  const merged: DraftToken[] = []

  for (const token of tokens) {
    const last = merged.at(-1)

    if (token.kind === 'text' && last?.kind === 'text') {
      merged[merged.length - 1] = { kind: 'text', value: last.value + token.value }
    } else {
      merged.push(token)
    }
  }

  return merged.filter((token) => token.kind !== 'text' || token.value !== '')
}

/** Команда в самом начале - «/review …»: CLI узнаёт её только по первому символу. */
const commandHead = (body: string): { tokens: DraftToken[]; rest: string } => {
  const match = REPLAY_COMMAND.exec(body)

  return match?.[1]
    ? {
        tokens: [chipToken({ kind: 'cmd', value: match[1] })],
        rest: body.slice(match[1].length + 1),
      }
    : { tokens: [], rest: body }
}

/** Кусок текста без блоков кода: цитаты ответа (по счёту с quoted) и вложения на местах. */
const plainTokens = (text: string, said: string, quoted: { count: number }): DraftToken[] => {
  const tokens: DraftToken[] = []

  for (const piece of splitQuotations(text)) {
    const needle = piece.quotation ? normalise(piece.text) : ''

    if (needle.length >= QUOTATION_MIN && said.includes(needle)) {
      quoted.count += 1
      tokens.push(chipToken({ kind: 'quote', value: `ref${quoted.count}`, text: piece.text }))
      continue
    }

    // Кавычки, которых агент не говорил, остаются как написаны - с самими кавычками.
    tokens.push(...attachmentTokens(piece.quotation ? `"${piece.text}"` : piece.text))
  }

  return tokens
}

/**
 * Текст сообщения обратно кусками. answered - что агент уже сказал в разговоре: по
 * нему кавычки отличаются от цитаты ответа. Куски файла с текстом («Send to Chat») узнаются
 * первыми, целиком: кавычки и «@» внутри кода - часть кода.
 */
export const replayedDraft = (text: string, answered: readonly string[] = []): MessageDraft => {
  const { quotes, body } = takeQuotedLines(text)
  const said = answered.map(normalise).join('\n')
  const head = commandHead(body)
  const tokens: DraftToken[] = [...head.tokens]
  const quoted = { count: 0 }
  let at = 0

  for (const match of head.rest.matchAll(REPLAY_SNIPPET)) {
    const [whole, path = '', range = '', , snippet = ''] = match

    tokens.push(...plainTokens(head.rest.slice(at, match.index), said, quoted))
    tokens.push(chipToken({ kind: 'ref', value: path, range, text: snippet }))
    at = match.index + whole.length
  }

  tokens.push(...plainTokens(head.rest.slice(at), said, quoted))

  return { tokens: merge(tokens), quotes }
}
