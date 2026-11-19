import type { FeedItem } from '@shared/conversation-feed'

/** Что хук конца хода знает о ходе: последний ответ, правленые файлы, время и цена. */
export type TurnSummary = {
  answer: string
  changedFiles: string[]
  durationMs: number | null
  costUsd: number | null
}

/**
 * Сводка последнего хода по ленте: всё после последнего сообщения человека, ответы главного
 * агента (не субагентов), итог хода, если он уже в ленте.
 */
export const turnSummary = (items: readonly FeedItem[]): TurnSummary => {
  let start = 0

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]

    if (item?.kind === 'user' && item.parentToolUseId === null) {
      start = index + 1
      break
    }
  }

  const turn = items.slice(start)
  const answers = turn.filter(
    (item): item is Extract<FeedItem, { kind: 'assistant' }> =>
      item.kind === 'assistant' && item.parentToolUseId === null,
  )
  const ended = turn.findLast(
    (item): item is Extract<FeedItem, { kind: 'turn' }> => item.kind === 'turn',
  )

  return {
    answer: answers.at(-1)?.text ?? '',
    changedFiles: ended ? ended.changes.map((change) => change.path) : [],
    durationMs: ended?.durationMs ?? null,
    costUsd: ended?.costUsd ?? null,
  }
}
