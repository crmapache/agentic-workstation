import { PASTE_ALWAYS_FOLDS_CHARS } from '@shared/ide-prefs'
import type { ChipKind, DraftChip } from '@shared/message-draft'

import { baseName } from '../../lib/path.utils'
import {
  TITLE_LINES,
  CHIP_PATH_KINDS,
  CARD_LABEL_CHARS,
  MAX_LABEL_LENGTH,
  PASTE_SCAN_CHARS,
  TITLE_LINE_CHARS,
  QUOTE_TITLE_CHARS,
  PASTE_PREVIEW_CHARS,
  PASTE_PREVIEW_WORDS,
  QUOTE_PREVIEW_WORDS,
} from './chips.constants'
import type { PathChipKind } from './draft.types'

/**
 * Подписи и подсказки чипов - одно правило для поля, очереди и ленты: чип для человека
 * один и тот же, где бы его ни нарисовали.
 */

/** Длинное имя режется посередине: расширение остаётся видно. */
export const truncateMiddle = (text: string, max = MAX_LABEL_LENGTH): string => {
  if (text.length <= max) return text

  const head = Math.ceil((max - 1) * 0.6)
  const tail = max - 1 - head

  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`
}

/** Начало цитаты словами, а не символами - чтобы не обрывать посреди слова. */
const quotePreview = (text: string): string => {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const preview = words.slice(0, QUOTE_PREVIEW_WORDS).join(' ')

  return words.length > QUOTE_PREVIEW_WORDS ? `${preview}…` : preview
}

/** Начало вставки: многоточие всегда - свёрнутая вставка по определению длиннее. */
const pastePreview = (text: string): string => {
  const words = text.slice(0, PASTE_SCAN_CHARS).trim().split(/\s+/).filter(Boolean)

  return `${words.slice(0, PASTE_PREVIEW_WORDS).join(' ').slice(0, PASTE_PREVIEW_CHARS)}…`
}

/** Заголовок карточки - первая строка её текста; длинный режется в конце, начало важнее. */
const cardPreview = (text: string): string => {
  const title = text.split('\n', 1)[0]?.trim() ?? ''

  return title.length > CARD_LABEL_CHARS ? `${title.slice(0, CARD_LABEL_CHARS - 1)}…` : title
}

/**
 * Подпись на самом чипе: имя файла (путь целиком - в тексте модели), начало цитаты, заголовок
 * карточки.
 */
export const chipLabel = (chip: DraftChip): string => {
  if (chip.kind === 'quote') return `${chip.value}: ${quotePreview(chip.text ?? '')}`
  if (chip.kind === 'paste') return pastePreview(chip.text ?? '')
  if (chip.kind === 'cmd') return `/${chip.value}`
  if (chip.kind === 'card') return cardPreview(chip.text ?? '')

  const name = truncateMiddle(baseName(chip.value))

  return chip.range ? `${name} ${chip.range}` : name
}

/** Сколько строк во вставке - считаются переносы, без массива строк на сотню килобайт. */
export const pasteLineCount = (text: string): number => {
  const body = text.trimEnd()

  if (!body) return 0

  let lines = 1

  for (let at = body.indexOf('\n'); at >= 0; at = body.indexOf('\n', at + 1)) lines += 1

  return lines
}

/** Первые строки, каждая короткая: подсказка - напоминание, а не способ прочитать. */
export const hintPreview = (text: string): string => {
  const lines = text.trim().split('\n')
  const shown = lines
    .slice(0, TITLE_LINES)
    .map((line) => (line.length > TITLE_LINE_CHARS ? `${line.slice(0, TITLE_LINE_CHARS)}…` : line))

  return lines.length > TITLE_LINES ? `${shown.join('\n')}\n…` : shown.join('\n')
}

/**
 * Подсказка чипа. У файла - только если имя не влезло в подпись: подсказка, которая
 * повторяет видимое, - потраченное наведение. Пусто - наводить не на что.
 */
export const chipTitle = (chip: DraftChip): string => {
  if (chip.kind === 'quote') {
    const text = (chip.text ?? '').trim()

    return text.length > QUOTE_TITLE_CHARS ? `${text.slice(0, QUOTE_TITLE_CHARS)}…` : text
  }

  // Вставка и карточка: под курсором - начало того, что уедет модели.
  if (chip.kind === 'paste' || chip.kind === 'card') return hintPreview(chip.text ?? '')

  const title = chip.range ? `${chip.value} ${chip.range}` : chip.value

  // Кусок файла с текстом: под курсором - что именно уехало, а не только откуда.
  if (chip.kind === 'ref' && chip.text !== undefined) return `${title}\n${hintPreview(chip.text)}`

  return chipLabel(chip).includes('…') ? title : ''
}

/**
 * Сворачивается ли вставка в чип. Больше потолка символов - всегда: поле с мегабайтом
 * перестаёт быть полем, что бы ни стояло в настройке. Иначе - по строкам, большему из
 * двух счётов: записанных и видимых в поле (одна строка без переносов в узком поле -
 * стена текста). minLines 0 - «никогда».
 */
export const collapsesPaste = (text: string, minLines: number, drawnLines = 0): boolean =>
  text.length > PASTE_ALWAYS_FOLDS_CHARS ||
  (minLines > 0 && Math.max(pasteLineCount(text), drawnLines) >= minLines)

/** Чип с путём в проекте - рисуется иконкой типа файла, а не значком вида. */
export const isPathChip = (kind: ChipKind): kind is PathChipKind =>
  Object.hasOwn(CHIP_PATH_KINDS, kind)
