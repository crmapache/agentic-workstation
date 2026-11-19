import { HELP_URL, URL_TAIL } from './HelpButton.constants'
import type { HelpChunk } from './HelpButton.types'

/** Абзацы пояснения: текст делится по пустым строкам, пустые куски выбрасываются. */
export const helpParagraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

/**
 * Абзац справки кусками: адрес https - ссылкой (условия сервиса, документация), остальное -
 * текстом как есть. Точка или скобка сразу за адресом остаётся тексту.
 */
export const helpChunks = (paragraph: string): HelpChunk[] => {
  const chunks: HelpChunk[] = []
  let done = 0

  for (const match of paragraph.matchAll(HELP_URL)) {
    const url = match[0].replace(URL_TAIL, '')

    if (match.index > done) chunks.push({ kind: 'text', text: paragraph.slice(done, match.index) })

    chunks.push({ kind: 'url', text: url })
    done = match.index + url.length
  }

  if (done < paragraph.length) chunks.push({ kind: 'text', text: paragraph.slice(done) })

  return chunks
}
