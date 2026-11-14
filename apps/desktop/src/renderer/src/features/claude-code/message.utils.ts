import type { DraftToken, MessageDraft } from '@shared/claude-draft'
import type { FeedItem, UserFeedItem } from '@shared/claude-feed'

import type { FilePlace } from '../../state/selection.store'
import { chipLabel, pasteLineCount } from './chips.utils'
import { clipboardTextOf } from './draft-clipboard.utils'
import { isPastedImage } from './draft.utils'
import { kindOfPath, replayedDraft } from './message-replay.utils'
import { RANGE_LABEL, PASTE_OPEN_CHARS, PASTE_BLOCK_CHARS } from './message.constants'

/**
 * Картинки сообщения без своего чипа в тексте (прежнее поле слало их отдельно) - чипами в
 * конце: лента картинок отдельно не рисует, и без чипа их не увидеть, не открыть и не
 * вернуть в поле. Номер - по месту среди вставленных, как у реплея.
 */
const withImageChips = (draft: MessageDraft, imageCount: number): MessageDraft => {
  const chipped = pastedOrdinals(draft.tokens).filter((ordinal) => ordinal >= 0).length

  if (chipped >= imageCount) return draft

  const added = Array.from({ length: imageCount - chipped }, (_, index): DraftToken[] => [
    ...(index > 0 || draft.tokens.length > 0 ? [{ kind: 'text', value: ' ' } as const] : []),
    { kind: 'chip', chip: { kind: 'img', value: `Image #${chipped + index + 1}` } },
  ])

  return { ...draft, tokens: mergeText([...draft.tokens, ...added.flat()]) }
}

/**
 * Отправленное сообщение кусками - для карточки, копии, возврата в поле и полки
 * закреплённых. Своё, отправленное из этого окна, несёт куски поля; прочитанное из
 * транскрипта разбирается из текста. У каждой картинки сообщения - свой чип.
 */
export const messageDraft = (item: UserFeedItem, answered: readonly string[] = []): MessageDraft =>
  withImageChips(item.draft ?? replayedDraft(item.text, answered), item.images.length)

/** Ответы агента выше сообщения: по ним кавычки в тексте узнаются цитатой ответа. */
export const answersBefore = (items: readonly FeedItem[], itemId: string): string[] => {
  const end = items.findIndex((item) => item.id === itemId)

  return items
    .slice(0, end < 0 ? items.length : end)
    .flatMap((item) => (item.kind === 'assistant' ? [item.text] : []))
}

/**
 * Сообщение в буфер: цитаты сверху строками «> », как их получил агент, вложения -
 * путями, а не подписями чипов: копию уносят в задачу или терминал.
 */
export const messageClipboard = ({ tokens, quotes }: MessageDraft): string =>
  [...quotes.map((quote) => `> ${quote}`), clipboardTextOf(tokens)]
    .filter((part) => part !== '')
    .join('\n')

/** Сообщение одной строкой подписями чипов - напоминание, как его видели на экране. */
export const messageLine = ({ tokens, quotes }: MessageDraft): string =>
  [
    ...quotes.map((quote) => `> ${quote}`),
    tokens.map((token) => (token.kind === 'text' ? token.value : chipLabel(token.chip))).join(''),
  ]
    .filter((part) => part.trim() !== '')
    .join('\n')

/** Что вернётся в поле и сколько вставленных картинок вернуть нельзя. */
export type ReusedMessage = { draft: MessageDraft; lostImages: number }

const mergeText = (tokens: readonly DraftToken[]): DraftToken[] => {
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

/** Порядковые номера вставленных картинок по чипам: k-й такой чип - k-я картинка сообщения. */
export const pastedOrdinals = (tokens: readonly DraftToken[]): number[] => {
  let next = 0

  return tokens.map((token) => (token.kind === 'chip' && isPastedImage(token.chip) ? next++ : -1))
}

/**
 * Сообщение для возврата в поле. Всё, кроме вставленной картинки, несёт себя в чипе.
 * Вставленная картинка k возвращается байтами (pictures[k] - из сообщения в
 * транскрипте), без них - файлом, куда её записали; без файла выпадает - и считается:
 * сообщение с пропавшей картинкой выглядит целым и ушло бы с подписью, за которой
 * ничего нет (ACC). Чип есть у каждой картинки сообщения (messageDraft).
 */
export const reusableMessage = (
  { tokens, quotes }: MessageDraft,
  pictures: readonly (string | null)[] = [],
): ReusedMessage => {
  const ordinals = pastedOrdinals(tokens)
  const kept: DraftToken[] = []
  let lostImages = 0

  for (const [index, token] of tokens.entries()) {
    const picture = pictures[ordinals[index] ?? -1]

    if (token.kind !== 'chip' || !isPastedImage(token.chip) || token.chip.data) {
      kept.push(token)
    } else if (picture) {
      kept.push({ kind: 'chip', chip: { ...token.chip, data: picture } })
    } else if (token.chip.path) {
      kept.push({
        kind: 'chip',
        chip: { kind: kindOfPath(token.chip.path), value: token.chip.path },
      })
    } else {
      lostImages += 1
    }
  }

  return { draft: { tokens: mergeText(kept), quotes }, lostImages }
}

/**
 * Сколько вставленных картинок не вернётся - до нажатия: у сообщения есть available
 * картинок (их байты отдаст транскрипт), остальные без файла пропадут.
 */
export const lostImages = (draft: MessageDraft, available: number): number =>
  reusableMessage(
    draft,
    Array.from({ length: available }, () => 'kept'),
  ).lostImages

/** Раскрытая вставка: текст до потолка по границе строки и сколько строк показано из скольких. */
export type PasteBody = { text: string; shownLines: number; lines: number }

export const pasteBody = (text: string): PasteBody => {
  const body = text.trimEnd()
  const lines = pasteLineCount(body)

  if (body.length <= PASTE_OPEN_CHARS) return { text: body, shownLines: lines, lines }

  const cut = body.lastIndexOf('\n', PASTE_OPEN_CHARS)
  const shown = body.slice(0, cut > 0 ? cut : PASTE_OPEN_CHARS)

  return { text: shown, shownLines: pasteLineCount(shown), lines }
}

/** Начало вставки для плашки во всю ширину - с переносами, по ним её и узнают. */
export const pasteBlockPreview = (text: string): string => {
  const body = text.trim()

  return body.length > PASTE_BLOCK_CHARS ? `${body.slice(0, PASTE_BLOCK_CHARS)}…` : body
}

const positive = (value: string | undefined): number | undefined => {
  const number = value === undefined ? Number.NaN : Number(value)

  return Number.isInteger(number) && number > 0 ? number : undefined
}

/**
 * Где открыть кусок файла по подписи чипа («L12-L18»). Конец колонки поле пишет
 * позицией после выделения, а редактору нужен последний символ - отсюда минус один.
 */
export const rangePlace = (range: string): FilePlace => {
  const match = RANGE_LABEL.exec(range.trim())
  const line = positive(match?.[1])

  if (!match || line === undefined) return {}

  const column = positive(match[2])
  const endLine = positive(match[3])
  const written = positive(match[4] ?? match[5])
  const endColumn = written === undefined ? undefined : written - 1

  return {
    line,
    ...(column !== undefined && { column }),
    ...(endLine !== undefined && { endLine }),
    ...(endColumn !== undefined && endColumn > 0 && { endColumn }),
  }
}
