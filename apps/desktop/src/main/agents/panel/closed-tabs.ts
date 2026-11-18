import type { ClosedConversation } from '@shared/claude'

import type { TabPlace } from '../tabs/tab-order'
import type { StoredConversation } from './panel-state'

/** Сколько закрытых вкладок проекта можно вернуть - как в браузере, последние двадцать. */
export const CLOSED_TABS_MAX = 20

/**
 * Закрытая человеком вкладка: тот же снимок, по которому вкладки переживают перезапуск,
 * плюс место на полосе. Возвращается под прежним id - окно держит черновик под ним же.
 */
export type ClosedTab = {
  stored: StoredConversation
  place: TabPlace
  closedAt: number
  /** В поле был черновик: пустую вкладку вернуть стоит только ради него. */
  hasDraft: boolean
}

/**
 * Стоит ли помнить закрытую вкладку. Пустую «New chat» - нет: вернуть нечего. Помнится
 * разговор, имя от человека, очередь, нерождённый форк и черновик.
 */
export const isWorthKeeping = (stored: StoredConversation, hasDraft: boolean): boolean =>
  hasDraft ||
  stored.queue.length > 0 ||
  stored.fork !== null ||
  (stored.outcome ?? 'none') !== 'none' ||
  (stored.titleSource ?? 'default') !== 'default'

/** Новая закрытая - первой; та же вкладка второй записью не стоит; старше двадцатой - уходят. */
export const rememberClosed = (list: readonly ClosedTab[], tab: ClosedTab): ClosedTab[] =>
  [tab, ...list.filter((item) => item.stored.id !== tab.stored.id)].slice(0, CLOSED_TABS_MAX)

/**
 * Достать закрытую вкладку: названную или последнюю. Уже открытую снова (из истории)
 * клавиша пропускает и выбрасывает - иначе нажатие тратилось бы на вкладку, которая и
 * так на полосе.
 */
export const takeClosed = (
  list: readonly ClosedTab[],
  id: string | null,
  isOpen: (id: string) => boolean,
): { tab: ClosedTab | null; rest: ClosedTab[] } => {
  const standing = list.filter((item) => !isOpen(item.stored.id))
  const tab = (id === null ? standing[0] : standing.find((item) => item.stored.id === id)) ?? null

  return { tab, rest: tab ? standing.filter((item) => item !== tab) : standing }
}

/** Строка «Recently closed» в истории - то, что окну нужно знать о закрытой вкладке. */
export const closedView = ({ stored, closedAt }: ClosedTab): ClosedConversation => ({
  id: stored.id,
  title: stored.title,
  titleSource: stored.titleSource ?? 'default',
  fork: stored.fork,
  depth: stored.depth ?? 0,
  closedAt,
})

const ids = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/**
 * Закрытые вкладки с диска. Разговор разбирает тот же разбор, что и открытые вкладки
 * (передаётся снаружи: claude-state сам зовёт этот разбор). Битая запись выпадает.
 */
export const parseClosed = (
  value: unknown,
  parseConversation: (value: unknown) => StoredConversation | null,
): ClosedTab[] =>
  Array.isArray(value)
    ? value.flatMap((item: unknown) => {
        if (typeof item !== 'object' || item === null) return []

        const record = item as Record<string, unknown>
        const stored = parseConversation(record['stored'])
        const place = (record['place'] ?? {}) as Record<string, unknown>

        if (!stored) return []

        return [
          {
            stored,
            place: { groupsLeft: ids(place['groupsLeft']), tabsLeft: ids(place['tabsLeft']) },
            closedAt: typeof record['closedAt'] === 'number' ? record['closedAt'] : 0,
            hasDraft: record['hasDraft'] === true,
          },
        ]
      })
    : []
