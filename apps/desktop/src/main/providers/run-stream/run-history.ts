import type { HistoryEntry } from '@shared/conversation'
import type { ProviderId } from '@shared/providers'

import { hiddenConversations } from '../../claude/history/hidden-conversations'
import { RunJournal } from './run-journal'

/** Папки журналов сессий прогонов по провайдеру: ставит исполнитель провайдера при создании. */
const journals = new Map<ProviderId, string>()

export const setRunJournals = (provider: ProviderId, dir: string): void => {
  journals.set(provider, dir)
}

/**
 * История панели провайдера без разговоров прогонов (головы и карточки сценариев, прогоны
 * заданий): их подняла сама IDE, как у Claude Code (hidden-conversations.ts). Книжки скрытых
 * знают id сессии движка - разговор у провайдера (поток Codex, сессия OpenCode) берётся из
 * журнала сессии.
 */
export const withoutRuns = async (
  provider: ProviderId,
  projectPath: string,
  entries: Promise<HistoryEntry[]>,
): Promise<HistoryEntry[]> => {
  const [listed, hidden] = await Promise.all([entries, hiddenConversations(projectPath)])
  const dir = journals.get(provider)

  if (!dir || hidden.size === 0) return listed

  const natives = await Promise.all(
    [...hidden].map((id) => RunJournal.open(dir, id).then((journal) => journal.native)),
  )
  const runs = new Set(natives.filter((native) => native !== null))

  return listed.filter((entry) => !runs.has(entry.sessionId))
}
