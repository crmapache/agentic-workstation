import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { buildFeedRows } from '../feed-rows.utils'
import { PendingContext, FeedScopeContext } from '../feed-scope.context'
import { ROW_RHYTHM } from '../Feed/Feed.constants'
import { EarlierMarker } from '../Feed/parts/EarlierMarker'
import { FeedRowView } from '../Feed/parts/FeedRowView'
import type { ConversationLogProps } from '../../../state/conversation-log.context'
import { SPEAKER_KEYS } from './ConversationLog.constants'
import styles from './ConversationLog.module.scss'

/**
 * Разговор CLI только для чтения - журнал шага сценария и разговор главного потока (ADR 0039):
 * те же строки, что лента панели, но без поля ввода, статуса, отката, форка, булавок и отката
 * файлов (readOnly в FeedScope), и без вопроса (PendingContext пуст) - «думает» под разговором,
 * кончившимся ночью, читалось бы как идущий. Ссылки, пути и блоки кода работают как в панели.
 * Прокрутки своей нет: журнал стоит в чужом окне и листается вместе с ним.
 */
export const ConversationLog = ({ feed, folder, speaker, onLoadEarlier }: ConversationLogProps) => {
  const { t } = useTranslation()
  const rows = useMemo(() => buildFeedRows(feed.items), [feed.items])
  const author = t(SPEAKER_KEYS[speaker])
  const scope = useMemo(
    () => ({ conversationId: feed.conversationId, projectPath: folder, readOnly: true, author }),
    [feed.conversationId, folder, author],
  )

  return (
    <FeedScopeContext value={scope}>
      <PendingContext value={null}>
        <div role="log" aria-label={t('claudeCode.conversationLog.label')} className={styles.log}>
          {feed.hasEarlier && onLoadEarlier && <EarlierMarker onLoad={onLoadEarlier} />}
          {rows.map((row) => (
            <div key={row.id} data-rhythm={ROW_RHYTHM[row.kind]} className={styles.row}>
              <FeedRowView row={row} />
            </div>
          ))}
        </div>
      </PendingContext>
    </FeedScopeContext>
  )
}
