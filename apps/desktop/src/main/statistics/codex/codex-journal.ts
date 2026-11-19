import { join, basename } from 'node:path'

import type { JournalFormat } from '../journals/journal-format'
import { walkJsonl } from '../transcripts/transcript-walk'
import { threadOfPath, parseCodexCarry } from './codex-carry'
import { CodexParser } from './codex-parser'

/**
 * Где Codex держит журналы разговоров: `sessions/ГГГГ/ММ/ДД/rollout-*.jsonl` и
 * `archived_sessions/` (заархивированный разговор переезжает туда целиком). Корень - общий
 * CODEX_HOME: у добавленных аккаунтов IDE журналы - ссылки на него (codex-accounts.ts).
 */
const JOURNAL_DIRS = ['sessions', 'archived_sessions']

const isRollout = (name: string) => name.startsWith('rollout-')

/** Журналы Codex. Переехавший в архив журнал читается заново - ключи записей те же. */
export const codexJournal: JournalFormat = {
  walk: async (home) => {
    const lists = await Promise.all(
      JOURNAL_DIRS.map((dir) =>
        walkJsonl(
          join(home, dir),
          (path) => ({ session: threadOfPath(basename(path)), subagent: false }),
          isRollout,
        ),
      ),
    )

    return lists.flat()
  },
  parser: (file, carry) => {
    const parser = new CodexParser(parseCodexCarry(carry, file.session))

    return {
      line: (raw) => parser.line(raw),
      take: () => parser.take(),
      get carry() {
        return JSON.stringify(parser.carry)
      },
    }
  },
}
