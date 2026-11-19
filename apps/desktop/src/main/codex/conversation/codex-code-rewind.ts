import type { FeedItem } from '@shared/conversation-feed'

import type { FileChange } from '../../agents/changes/code-revert'

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * Правки Codex с сообщения и после - по порядку ленты: вызовы apply_patch, которые применились.
 * Вернуть их - общим откатом кода (agents/changes/code-revert.ts).
 */
export const changesFrom = (items: readonly FeedItem[], messageId: string): FileChange[] => {
  const start = items.findIndex((item) => item.id === messageId)

  return start < 0
    ? []
    : items.slice(start).flatMap((item): FileChange[] => {
        if (item.kind !== 'tool' || item.name !== 'apply_patch' || item.status !== 'done') return []

        const { action } = item
        const movedTo = text(item.input['movePath'])

        return action.kind === 'edit' || action.kind === 'write'
          ? [
              {
                path: action.path,
                movedFrom: movedTo ? text(item.input['path']) : '',
                kind: text(item.input['kind']),
                hunks: action.preview,
              },
            ]
          : []
      })
}
