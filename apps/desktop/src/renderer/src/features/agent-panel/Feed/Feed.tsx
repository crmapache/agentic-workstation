import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { buildFeedRows } from '../feed-rows.utils'
import { PendingContext, FeedScopeContext } from '../feed-scope.context'
import { useLoadEarlier } from '../feed.queries'
import { useConversationFeed, usePanelCapabilities } from '../panel.queries'
import { usePinJump } from '../pins.hooks'
import { useSearchJump, useSearchPaint } from '../search-feed.hooks'
import { useSelectedStream } from '../streams.hooks'
import { AgentStreamView } from '../AgentStreamView/AgentStreamView'
import { CarryOnRow } from '../CarryOnRow/CarryOnRow'
import { PinnedBar } from '../PinnedBar/PinnedBar'
import { SearchCapsule } from '../SearchCapsule/SearchCapsule'
import { StreamSwitcher } from '../StreamSwitcher/StreamSwitcher'
import { ROW_RHYTHM, ROW_ATTRIBUTE } from './Feed.constants'
import { useUnread, useFeedScroll } from './Feed.hooks'
import styles from './Feed.module.scss'
import type { FeedProps } from './Feed.types'
import { EarlierMarker } from './parts/EarlierMarker'
import { FeedRowView } from './parts/FeedRowView'
import { JumpButton } from './parts/JumpButton'
import { WorkingLine } from './parts/WorkingLine'

/**
 * Лента разговора, как в ACC: над ней ряд потоков (субагенты, фоновые команды) и полка
 * закреплённых поверх верха, внутри - реплики, вызовы, правки, итоги и последней строкой
 * статус. Сверху - «load earlier messages», если транскрипт длиннее загруженного. Выбран
 * поток агента - его окно слоем поверх ленты.
 */
export const Feed = ({ conversation, items }: FeedProps) => {
  const { t } = useTranslation()
  const rows = useMemo(() => buildFeedRows(items), [items])
  const scope = useMemo(
    () => ({ conversationId: conversation.id, projectPath: conversation.projectPath }),
    [conversation.id, conversation.projectPath],
  )
  const canSearch = usePanelCapabilities().search
  const hasEarlier = useConversationFeed(conversation.id).data?.hasEarlier ?? false
  const selected = useSelectedStream(conversation.id)
  const [pinsHeight, setPinsHeight] = useState(0)
  const { pages, isLoading, loadEarlier, loadThrough } = useLoadEarlier(conversation.id)
  const lastUserId = items.findLast((item) => item.kind === 'user')?.id
  const {
    lit,
    isAway,
    goToRow,
    keepPlace,
    contentRef,
    scrollerRef,
    handleClick,
    jumpToBottom,
    handleScroll,
    handlePointerDown,
  } = useFeedScroll(conversation.id, lastUserId, pages, pinsHeight)
  const unread = useUnread(rows, isAway)
  const jumpToPin = usePinJump(items, goToRow, loadThrough)

  // Поиск по разговорам: прыжок к выбранной находке и подсветка найденных слов.
  useSearchJump({
    conversationId: conversation.id,
    items,
    goToRow,
    hasEarlier,
    isLoadingEarlier: isLoading,
    loadEarlier,
  })
  useSearchPaint(contentRef, conversation.id, items)

  const handleLoadEarlier = () => {
    keepPlace()
    loadEarlier()
  }

  return (
    <FeedScopeContext value={scope}>
      <PendingContext value={conversation.pending}>
        <div className={styles.feed}>
          <StreamSwitcher conversation={conversation} items={items} />
          <div className={styles.feedWrap}>
            {!selected && (
              <PinnedBar
                conversationId={conversation.id}
                items={items}
                onJump={jumpToPin}
                onHeight={setPinsHeight}
              />
            )}
            <div
              ref={scrollerRef}
              className={clsx(styles.scroller, selected && styles.covered)}
              // eslint-disable-next-line no-restricted-syntax -- запас под полку закреплённых: её высота меряется в рантайме
              style={{ paddingTop: pinsHeight }}
              onScroll={handleScroll}>
              <div
                ref={contentRef}
                role="log"
                aria-label={t('agentPanel.feed.label')}
                className={styles.content}
                onPointerDownCapture={handlePointerDown}
                onClickCapture={handleClick}>
                {hasEarlier && <EarlierMarker onLoad={handleLoadEarlier} />}
                {rows.map((row) => (
                  <div
                    key={row.id}
                    {...{ [ROW_ATTRIBUTE]: row.id }}
                    data-rhythm={ROW_RHYTHM[row.kind]}
                    data-lit={lit === row.id || undefined}
                    className={styles.row}>
                    <FeedRowView row={row} />
                  </div>
                ))}
                <WorkingLine conversation={conversation} items={items} />
                <CarryOnRow conversation={conversation} />
              </div>
            </div>
            {isAway && !selected && <JumpButton unread={unread} onJump={jumpToBottom} />}
            {/* Поток агента - слоем поверх ленты: лента не размонтируется и держит место. */}
            {selected && (
              <div className={styles.streamLayer}>
                <AgentStreamView conversation={conversation} items={items} />
              </div>
            )}
            {!selected && canSearch && (
              <SearchCapsule conversationId={conversation.id} offset={pinsHeight} />
            )}
          </div>
        </div>
      </PendingContext>
    </FeedScopeContext>
  )
}
