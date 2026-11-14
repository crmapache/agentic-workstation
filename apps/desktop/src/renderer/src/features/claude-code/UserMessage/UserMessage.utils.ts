import type { DraftToken, PicturePlace } from '@shared/claude-draft'

import type { PictureSource } from '../picture.types'
import { chipPicture } from '../picture.utils'
import { BREAK_ATTRIBUTE, PARAGRAPH_BREAK, TOKEN_ATTRIBUTE } from './UserMessage.constants'

const pad = (value: number): string => String(value).padStart(2, '0')

// Пустая строка - одна или несколько подряд, в том числе из одних пробелов.
const BLANK_LINES = /\n[^\S\n]*\n(?:[^\S\n]*\n)*/

/**
 * Кусок текста абзацами: граница - пустая строка. Одиночный перенос остаётся в абзаце,
 * пустая строка уходит целиком - на её месте лента ставит короткий зазор, а не высоту
 * целой строки.
 */
export const splitParagraphs = (text: string): string[] => text.split(BLANK_LINES)

/** Время сообщения в шапке - ЧЧ:ММ по часам машины; 0 - время неизвестно, пусто. */
export const formatClock = (time: number): string => {
  if (time <= 0) return ''

  const date = new Date(time)

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Картинка за каждым чипом сообщения (null - не картинка). Вставленная, у которой нет
 * файла, берётся из строки сообщения в транскрипте - по её месту среди вставленных.
 */
export const messagePictures = (
  tokens: readonly DraftToken[],
  ordinals: readonly number[],
  conversationId: string,
  messageId: string,
): (PictureSource | null)[] =>
  tokens.map((token, index) => {
    if (token.kind !== 'chip') return null

    const image = ordinals[index] ?? -1
    const said: PicturePlace | null =
      image >= 0 && conversationId && messageId
        ? { kind: 'said', conversationId, messageId, image }
        : null

    return chipPicture(token.chip, said)
  })

/**
 * Что из сообщения попало в выделение - кусками, как в поле ввода: набранное - ровно в
 * границах выделения, вложение - целиком, если выделение его задело, зазор абзацев - пустой
 * строкой. null - копирует браузер: выделение выходит за сообщение, лежит внутри одного
 * вложения (строки раскрытой вставки) или вложений не задевает.
 */
export const pickedTokens = (
  root: HTMLElement,
  range: Range,
  tokens: readonly DraftToken[],
): DraftToken[] | null => {
  const common = range.commonAncestorContainer
  const commonElement = common instanceof Element ? common : common.parentElement

  if (
    range.collapsed ||
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return null
  }
  if (commonElement?.closest(`[${TOKEN_ATTRIBUTE}]`)) return null

  const picked: DraftToken[] = []

  const pushText = (value: string) => {
    const last = picked.at(-1)

    if (!value) return
    if (last?.kind === 'text')
      picked[picked.length - 1] = { kind: 'text', value: last.value + value }
    else picked.push({ kind: 'text', value })
  }

  const visit = (node: Node) => {
    if (!range.intersectsNode(node)) return

    if (node instanceof Text) {
      const start = node === range.startContainer ? range.startOffset : 0
      const end = node === range.endContainer ? range.endOffset : node.data.length

      return pushText(node.data.slice(start, end))
    }

    // Подсказки (popover) - не текст сообщения; у значков (svg) текста нет.
    if (!(node instanceof HTMLElement) || node.hasAttribute('popover')) return

    const index = node.getAttribute(TOKEN_ATTRIBUTE)
    const token = index === null ? undefined : tokens[Number(index)]

    if (token) return void picked.push(token)
    if (node.hasAttribute(BREAK_ATTRIBUTE)) return pushText(PARAGRAPH_BREAK)

    node.childNodes.forEach(visit)
  }

  root.childNodes.forEach(visit)

  return picked.some((token) => token.kind === 'chip') ? picked : null
}
