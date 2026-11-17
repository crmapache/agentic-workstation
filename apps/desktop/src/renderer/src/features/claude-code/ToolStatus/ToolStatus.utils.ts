import type { TFunction } from 'i18next'

import type { ToolMeta } from '../tool-summary.utils'
import { CLOSED_META_KEYS } from './ToolStatus.constants'

/** Итог вызова словами; пусто - сказать нечего. */
export const metaText = (t: TFunction, meta: ToolMeta): string => {
  switch (meta.kind) {
    case 'failed':
      return t('claudeCode.feed.tool.failed')
    case 'denied':
      return t('claudeCode.feed.tool.denied')
    case 'lines':
      return t('claudeCode.feed.tool.lines', { count: meta.count })
    case 'matches':
      return meta.count > 0
        ? t('claudeCode.feed.tool.matches', { count: meta.count })
        : t('claudeCode.feed.tool.noMatches')
    case 'output':
      return meta.empty ? t('claudeCode.feed.tool.noOutput') : t('claudeCode.feed.tool.output')
    case 'diff':
      return t('claudeCode.feed.tool.diff', { added: meta.added, removed: meta.removed })
    case 'uncounted':
      return t('claudeCode.feed.tool.uncounted')
    case 'closed':
      return t(CLOSED_META_KEYS[meta.reason])
    default:
      return ''
  }
}
