import { useTranslation } from 'react-i18next'

import type { FeedItemWire } from '@agentic-workstation/remote-protocol/wire-types'

import styles from '../Feed.module.scss'
import { flag, list, text, count, isFields } from '../Feed.utils'
import { costText, clockText, durationText } from '../../../../lib/time.utils'

/** Строка одного события ленты словами: конец хода, отметка IDE, сжатие, повтор, лимит, модель. */
const eventText = (t: ReturnType<typeof useTranslation>['t'], item: FeedItemWire): string => {
  switch (item.kind) {
    case 'turn': {
      const changes = list(item, 'changes').filter(isFields)
      const added = changes.reduce((sum, change) => sum + count(change, 'added'), 0)
      const removed = changes.reduce((sum, change) => sum + count(change, 'removed'), 0)
      const head = flag(item, 'interrupted')
        ? t('feed.turn.stopped')
        : flag(item, 'isError')
          ? t('feed.turn.error')
          : t('feed.turn.done')

      return [
        head,
        durationText(t, count(item, 'durationMs')),
        count(item, 'costUsd') > 0 && costText(count(item, 'costUsd')),
        changes.length > 0 && t('feed.turn.files', { count: changes.length, added, removed }),
      ]
        .filter(Boolean)
        .join(' · ')
    }
    case 'notice':
      return [
        t(`feed.notice.${text(item, 'code')}`, { defaultValue: text(item, 'code') }),
        text(item, 'detail'),
      ]
        .filter(Boolean)
        .join(': ')
    case 'compact':
      return flag(item, 'pending') ? t('feed.compacting') : t('feed.compacted')
    case 'retry':
      return t('feed.retry', {
        attempt: count(item, 'attempt'),
        max: count(item, 'maxRetries') || '?',
      })
    case 'model':
      return t('feed.modelSwitch', { from: text(item, 'from'), to: text(item, 'to') })
    case 'limit':
      return count(item, 'resetsAt') > 0
        ? t('feed.limitUntil', { at: clockText(count(item, 'resetsAt')) })
        : t('feed.limit')
    default:
      return ''
  }
}

/** Служебная строка ленты - тихо, по центру: она про ход, а не часть разговора. */
export const EventLine = ({ item }: { item: FeedItemWire }) => {
  const { t } = useTranslation()
  const words = eventText(t, item)

  if (!words) return null

  return <p className={item.kind === 'notice' ? styles.notice : styles.event}>{words}</p>
}
