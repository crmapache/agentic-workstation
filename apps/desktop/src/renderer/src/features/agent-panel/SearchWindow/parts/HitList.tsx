import { useRef, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import styles from '../SearchWindow.module.scss'
import type { HitListProps } from '../SearchWindow.types'
import { useNow } from '../../clock.hooks'
import { AI_CLOCK_MS } from '../../search.constants'
import { groupByChat, describeWhen } from '../../search.utils'
import { HitRow } from './HitRow'

/**
 * Находки: по всем чатам и у модели - группами по разговору (имя, когда, сколько
 * сообщений), в одном чате - просто строками, где заголовок был бы один над всем.
 * Выбранная клавишами строка сама въезжает в поле зрения.
 */
export const HitList = ({
  tab,
  hits,
  selected,
  unfolded,
  emptyText,
  onPick,
  onUnfold,
}: HitListProps) => {
  const { t } = useTranslation()
  const listRef = useRef<HTMLDivElement>(null)
  const now = useNow(false, AI_CLOCK_MS)
  const groups = useMemo(
    () =>
      tab === 'chat'
        ? [{ conversationId: '', title: '', at: 0, messages: 0, hits: [...hits] }]
        : groupByChat(hits),
    [tab, hits],
  )

  useEffect(() => {
    if (selected < 0) return

    listRef.current
      ?.querySelector(`[data-search-hit="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (hits.length === 0) {
    return (
      <div className={styles.list}>
        <p className={styles.empty}>{emptyText}</p>
      </div>
    )
  }

  return (
    <div ref={listRef} className={styles.list}>
      {groups.map((group) => (
        <div key={group.conversationId || 'here'} className={styles.group}>
          {group.conversationId && (
            <div className={styles.groupHead}>
              <span className={styles.groupTitle}>
                {group.title || t('agentPanel.search.untitled')}
              </span>
              <span className={styles.groupMeta}>
                {[
                  group.at > 0 ? describeWhen(t, group.at, now) : '',
                  t('agentPanel.search.messages', { count: group.messages }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className={styles.groupRule} aria-hidden />
            </div>
          )}
          {group.hits.map((hit) => {
            const index = hits.indexOf(hit)

            return (
              <HitRow
                key={`${hit.conversationId}:${hit.uuid}`}
                hit={hit}
                index={index}
                selected={index === selected}
                withTime={tab === 'chat'}
                unfolded={unfolded.has(hit.uuid)}
                onPick={() => onPick(hit)}
                onUnfold={() => onUnfold(hit.uuid)}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
