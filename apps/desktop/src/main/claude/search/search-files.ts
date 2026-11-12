import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { SearchHit } from '@shared/claude-search'

import { hiddenConversations } from '../history/hidden-conversations'
import { projectSlug, transcriptDirs } from '../history/transcript-paths'
import type { SearchIndex, TranscriptFile } from './search-index'
import { HIT_TEXT_CHARS } from './search.constants'
import type { IndexedMessage } from './search.types'

/** Сколько от имени папки проекта брать в имя папки индекса: остальное скажет хеш. */
const SLUG_CHARS = 80
const HASH_CHARS = 12

/**
 * Папка индекса проекта: читаемое начало пути и хеш - два проекта с похожими путями не
 * делят одну, а длинный путь не упирается в предел длины имени.
 */
export const indexDirFor = (base: string, rootPath: string): string =>
  join(
    base,
    `${projectSlug(rootPath).slice(0, SLUG_CHARS)}-${createHash('sha256').update(rootPath).digest('hex').slice(0, HASH_CHARS)}`,
  )

/**
 * Транскрипты, которые поиску можно читать, как их видит история: файлы верхнего уровня,
 * без субагентов.
 */
export const transcriptsOf = async (rootPath: string): Promise<TranscriptFile[]> => {
  const files: TranscriptFile[] = []
  // Разговоры прогонов сценариев - служебные: их не ищут, как и не видят в истории.
  const seen = new Set<string>(await hiddenConversations(rootPath))

  for (const dir of await transcriptDirs(rootPath)) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const id = entry.name.slice(0, -'.jsonl'.length)

      if (!entry.isFile() || !entry.name.endsWith('.jsonl') || seen.has(id)) continue

      seen.add(id)
      files.push({ id, file: join(dir, entry.name) })
    }
  }

  return files
}

/** Находка для окна: сообщение, имя его разговора и кусок с закрашенными словами. */
export const hitOf = (
  index: SearchIndex,
  found: { message: IndexedMessage; snippet: string; spans: [number, number][] },
  reason = '',
): SearchHit => {
  const { message } = found
  const { title, titleSource, messages } = index.describe(message.conversation)

  return {
    conversationId: message.conversation,
    uuid: message.uuid,
    anchor: message.anchor,
    speaker: message.speaker,
    at: message.at,
    title,
    titleSource,
    messages,
    snippet: found.snippet,
    spans: found.spans,
    text: message.text.slice(0, HIT_TEXT_CHARS),
    truncated: message.text.length > HIT_TEXT_CHARS,
    length: message.text.length,
    ...(reason ? { reason } : {}),
  }
}
