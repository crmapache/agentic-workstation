import type { TFunction } from 'i18next'

import type { FeedItem, ToolFeedItem } from '@shared/conversation-feed'

import { CLOSED_KEYS } from '../agents.constants'
import type { EndNote, JournalRow } from './AgentLog.types'

/**
 * Чем кончился агент, если не ответом: закрыт без ответа (процесс умер, ход кончился,
 * транскрипт молчит) - причиной; упал или остановлен - так и сказано. Убитый агент без
 * этой строки выглядел бы точь-в-точь как закончивший, с обрывком отчёта на месте.
 */
export const endNoteOf = (t: TFunction, tool: ToolFeedItem): EndNote | null => {
  if (tool.status === 'interrupted' && tool.closedReason) {
    const tone = tool.closedReason === 'replay' || tool.closedReason === 'untracked' ? 'dim' : 'bad'

    return { text: t(CLOSED_KEYS[tool.closedReason]), tone }
  }

  if (tool.task?.outcome === 'failed') {
    return { text: t('agentPanel.agents.failedBeforeFinishing'), tone: 'bad' }
  }

  if (tool.task?.outcome === 'stopped' || tool.status === 'interrupted') {
    return { text: t('agentPanel.agents.stoppedBeforeFinishing'), tone: 'bad' }
  }

  return null
}

/** Шаги агента строками журнала: мысли подряд - одной строкой, как в ленте. */
export const journalRows = (steps: readonly FeedItem[]): JournalRow[] => {
  const rows: JournalRow[] = []

  for (const step of steps) {
    const last = rows.at(-1)

    if (step.kind === 'thinking' && last?.kind === 'thinking') last.items.push(step)
    else if (step.kind === 'thinking') rows.push({ kind: 'thinking', id: step.id, items: [step] })
    else if (step.kind === 'tool') rows.push({ kind: 'tool', id: step.id, item: step })
    else if (step.kind === 'assistant') rows.push({ kind: 'remark', id: step.id, item: step })
  }

  return rows
}
