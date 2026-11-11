import type { BrowserMethods } from '@agentic-workstation/browser-protocol/protocol'
import { formatTabReference } from '@agentic-workstation/browser-protocol/tab-reference'

import type { BrowserProfile } from '../../../browser/browser-hub'
import { tabKey } from '../../../browser/browser-sessions'

const TITLE_MAX = 100
const URL_MAX = 150

type Listing = { profile: BrowserProfile; listing: BrowserMethods['tabs.list']['result'] }

export type TabListOptions = {
  /** Часть заголовка или адреса, без учёта регистра; пусто - все. */
  query: string
  limit: number
  /** Кто держит вкладку: «you», «another conversation» или никто. */
  holderOf: (key: string) => string | null
}

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text

/**
 * Список вкладок для модели - строкой на вкладку, с фильтром и пределом. У человека бывают
 * сотни вкладок, а ответ инструмента шлюз и модель принимают ограниченный: JSON всех вкладок
 * со всеми полями переполнял его. Сверх предела - «ещё N», чтобы модель сузила запрос.
 */
export const tabLines = (listings: readonly Listing[], options: TabListOptions): string => {
  const query = options.query.trim().toLowerCase()
  const lines: string[] = []
  let left = options.limit

  for (const { profile, listing } of listings) {
    const groups = new Map(listing.groups.map((group) => [group.groupId, group.title]))
    const matching = listing.tabs.filter(
      (tab) =>
        !query || tab.title.toLowerCase().includes(query) || tab.url.toLowerCase().includes(query),
    )
    const shown = matching.slice(0, Math.max(0, left))

    left -= shown.length
    lines.push(
      `Profile "${profile.name}" (${profile.key}), ${profile.browser}: ${matching.length} of ${listing.tabs.length} tabs${query ? ` match "${options.query.trim()}"` : ''}`,
    )

    for (const tab of shown) {
      const reference = formatTabReference({
        profileKey: profile.key,
        tabId: tab.tabId,
        launch: profile.launch || null,
      })
      const holder = options.holderOf(tabKey(profile.key, tab.tabId))
      const marks = [
        tab.active ? '[active]' : '',
        tab.groupId >= 0 ? `[group "${groups.get(tab.groupId) ?? ''}"]` : '',
        holder ? `[held by ${holder}]` : '',
      ].filter(Boolean)

      lines.push(
        [
          `- ${reference}`,
          `"${clip(tab.title.replace(/\s+/g, ' ').trim(), TITLE_MAX)}"`,
          clip(tab.url, URL_MAX),
          ...marks,
        ].join(' '),
      )
    }

    if (matching.length > shown.length) {
      lines.push(
        `  … ${matching.length - shown.length} more: narrow the list with "query" or raise "limit".`,
      )
    }
  }

  return lines.join('\n')
}
