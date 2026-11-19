import type { JournalFormat } from '../journals/journal-format'
import { FileParser } from './file-parser'
import type { SpanRow } from './parsed-rows'
import { walkTranscripts } from './transcript-walk'

const parseSpan = (text: string | null): SpanRow | null => {
  if (!text) return null

  try {
    return JSON.parse(text) as SpanRow
  } catch {
    return null
  }
}

/**
 * Транскрипты Claude Code: projects/ в доме CLI, файл - разговор или его субагент. От прохода
 * к проходу разбор помнит только открытый отрезок активности.
 */
export const claudeJournal: JournalFormat = {
  walk: walkTranscripts,
  parser: (file, carry, tools) => {
    const parser = new FileParser(
      { session: file.session, subagent: file.subagent, ...tools },
      parseSpan(carry),
    )

    return {
      line: (raw) => parser.line(raw),
      take: () => parser.take(),
      get carry() {
        const span = parser.carry

        return span && JSON.stringify(span)
      },
    }
  },
}
