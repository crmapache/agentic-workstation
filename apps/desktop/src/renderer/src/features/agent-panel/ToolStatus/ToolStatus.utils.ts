import type { TFunction } from 'i18next'

import type { ToolMeta } from '../tool-summary.utils'
import { CLOSED_META_KEYS } from './ToolStatus.constants'

/** Итог вызова словами; пусто - сказать нечего. */
export const metaText = (t: TFunction, meta: ToolMeta): string => {
  switch (meta.kind) {
    case 'failed':
      return t('agentPanel.feed.tool.failed')
    case 'denied':
      return t('agentPanel.feed.tool.denied')
    case 'lines':
      return t('agentPanel.feed.tool.lines', { count: meta.count })
    case 'matches':
      return meta.count > 0
        ? t('agentPanel.feed.tool.matches', { count: meta.count })
        : t('agentPanel.feed.tool.noMatches')
    case 'output':
      return meta.empty ? t('agentPanel.feed.tool.noOutput') : t('agentPanel.feed.tool.output')
    case 'diff':
      return t('agentPanel.feed.tool.diff', { added: meta.added, removed: meta.removed })
    case 'uncounted':
      return t('agentPanel.feed.tool.uncounted')
    case 'closed':
      return t(CLOSED_META_KEYS[meta.reason])
    default:
      return ''
  }
}
