import type { FeedItem, FileChange } from '@shared/conversation-feed'

/**
 * Файлы, которые поменял ход провайдера без своих копий файлов (Codex, OpenCode): правки
 * (вызовы с видом edit или write) с цифрами из их кусков, по файлу. Кнопки отката хода у
 * них нет (undoable false): код возвращается откатом к сообщению.
 */
export const toolTurnChanges = (items: readonly FeedItem[]): FileChange[] => {
  const byPath = new Map<string, FileChange>()

  for (const item of items) {
    if (item.kind !== 'tool' || item.status !== 'done' || !item.result?.changeCounts) continue

    const { action } = item

    if (action.kind !== 'edit' && action.kind !== 'write') continue

    const known = byPath.get(action.path)
    const { added, removed } = item.result.changeCounts

    byPath.set(action.path, {
      path: action.path,
      added: (known?.added ?? 0) + added,
      removed: (known?.removed ?? 0) + removed,
      created: (known?.created ?? false) || item.result.created === true,
      counted: true,
      undoable: false,
      reverted: false,
      refusal: null,
    })
  }

  return [...byPath.values()]
}
