import type { FeedItem } from '@shared/conversation-feed'

/** Строка ленты - по id её первого элемента: у групп и мыслей в id приставка. */
export const itemIdOfRow = (rowId: string): string => rowId.replace(/^(think|group):/, '')

/**
 * Где режется форк из выделения (как в ACC): до конца хода, в котором выделили, - то
 * есть перед следующим сообщением человека. Написанное посреди хода не форкается, и
 * резать перед ним нельзя. null - выделили в последнем ходе: форк несёт весь разговор.
 */
export const forkPointAfter = (items: readonly FeedItem[], rowId: string): string | null => {
  const at = items.findIndex((item) => item.id === itemIdOfRow(rowId))

  if (at < 0) return null

  const next = items.slice(at + 1).find((item) => item.kind === 'user' && !item.steering)

  return next?.id ?? null
}

/**
 * Где встать меню выделения: над выделением по центру, у края окна - прижато, нет места
 * сверху - под ним.
 */
export const menuPlace = (
  selection: { top: number; bottom: number; left: number; right: number },
  menu: { width: number; height: number },
  bounds: { width: number },
  gap: number,
): { left: number; top: number } => {
  const center = (selection.left + selection.right) / 2
  const left = Math.min(Math.max(gap, center - menu.width / 2), bounds.width - menu.width - gap)
  const above = selection.top - menu.height - gap

  return { left, top: above >= gap ? above : selection.bottom + gap }
}
