import type { WorktreeFacts } from '@shared/scenario-queues'

import type { WorktreeFactLine } from './WorktreeRemoveDialog.types'

/**
 * Что человек потеряет с папкой worktree - строками: свои коммиты (ветка остаётся), правки
 * (теряются), или терять нечего. Папки уже нет - одной строкой, остальное не читается.
 */
export const factLines = (facts: WorktreeFacts): WorktreeFactLine[] => {
  if (!facts.exists) return [{ kind: 'missing' }]

  const lines: WorktreeFactLine[] = []

  if (facts.commitsAhead > 0) lines.push({ kind: 'ahead', count: facts.commitsAhead })
  if (facts.dirty) lines.push({ kind: 'dirty' })

  return lines.length > 0 ? lines : [{ kind: 'clean' }]
}

/** Очередь оставила в worktree работу: при закрытии он остаётся, а не уходит сам. */
export const hasWork = (facts: WorktreeFacts): boolean =>
  facts.exists && (facts.commitsAhead > 0 || facts.dirty)
