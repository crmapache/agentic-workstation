import type { TitleSource } from '@shared/conversation'

import { recordField, stringField, parseCliLine } from '../cli/cli-messages'
import { userTextOf } from '../feed/user-text'
import { TITLE_MAX_CHARS } from './history.constants'

/**
 * Заголовок разговора в истории и чей он (ранг имени вкладки), или null - в транскрипте
 * нет ни одного сообщения человека.
 */
export type TranscriptSummary = { title: string; source: TitleSource } | null

/** Обрезка по слову: заголовок не обрывается посреди слова. */
export const shortenTitle = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim()

  if (flat.length <= TITLE_MAX_CHARS) return flat

  const cut = flat.slice(0, TITLE_MAX_CHARS)
  const space = cut.lastIndexOf(' ')

  return `${space > TITLE_MAX_CHARS / 2 ? cut.slice(0, space) : cut}…`
}

/** Первое настоящее сообщение человека в строках транскрипта. */
const firstUserText = (lines: string[]) => {
  for (const line of lines) {
    if (!line.includes('"type":"user"')) continue

    const message = parseCliLine(line)

    if (!message || message['isMeta'] === true || message['isSidechain'] === true) continue

    const user = userTextOf(recordField(message, 'message')['content'])

    if (user?.text && !user.text.startsWith('[Request interrupted')) return user.text
  }

  return null
}

/** Последний заголовок данного вида (свой от человека или придуманный CLI). */
const lastTitle = (lines: string[], type: string, field: string) => {
  for (const line of [...lines].reverse()) {
    if (!line.includes(`"type":"${type}"`)) continue

    const message = parseCliLine(line)
    const title = message ? stringField(message, field).trim() : ''

    if (title) return title
  }

  return null
}

/**
 * Заголовок из начала и конца транскрипта: свой заголовок человека, потом заголовок,
 * который придумал CLI, потом первое сообщение. Нет ничего - в транскрипте не было
 * разговора. Первая строка хвоста может быть обрезана посередине - она просто не
 * разберётся.
 */
export const summarizeTranscript = (head: string, tail: string): TranscriptSummary => {
  const headLines = head.split('\n')
  const lines = tail ? [...headLines, ...tail.split('\n')] : headLines
  const own = lastTitle(lines, 'custom-title', 'customTitle')

  // Имя от человека - как есть: вкладка отдаст его обратно в транскрипт, и обрезка
  // записалась бы поверх самого имени.
  if (own) return { title: own, source: 'user' }

  const model = lastTitle(lines, 'ai-title', 'aiTitle')
  const title = model ?? firstUserText(headLines)

  return title ? { title: shortenTitle(title), source: model ? 'llm' : 'heuristic' } : null
}
