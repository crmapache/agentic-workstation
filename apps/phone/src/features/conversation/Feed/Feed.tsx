import { useMemo, useState, useCallback } from 'react'
import { ArrowUpToLine, MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { PhotoViewer } from '../PhotoViewer/PhotoViewer'
import { LinkWait } from '../../../shell/LinkWait/LinkWait'
import styles from './Feed.module.scss'
import type { FeedProps, OpenPhoto } from './Feed.types'
import { topLevel, innerSteps } from './Feed.utils'
import { FeedItemView } from './parts/FeedItemView'
import { TaskList } from './parts/TaskList'

/**
 * Лента разговора на телефоне: снимок последних элементов и живые заплатки, свой лёгкий рендер.
 * Выше снимка - страницами по кнопке. То, что случилось внутри субагентов, - числом шагов на
 * строке его вызова; фото сообщения открывается крупно. Журнал шага прогона - та же лента без
 * действий и без крупных фото.
 */
export const Feed = ({
  agentId,
  view,
  working,
  loadingEarlier,
  onLoadEarlier,
  actions,
  photos = true,
}: FeedProps) => {
  const { t } = useTranslation()
  const [photo, setPhoto] = useState<OpenPhoto | null>(null)
  const items = useMemo(() => (view ? topLevel(view.items) : []), [view])
  const steps = useMemo(() => (view ? innerSteps(view.items) : new Map<string, number>()), [view])
  // Стабильная ссылка: строки ленты - memo, и новая функция перерисовала бы каждую.
  const handleOpenPhoto = useCallback((opened: OpenPhoto) => setPhoto(opened), [])

  if (!view) return <LinkWait agentId={agentId} label={t('conversation.loading')} />

  if (items.length === 0 && !working && !view.hasEarlier) {
    return <EmptyState icon={MessageSquare} title={t('conversation.empty')} />
  }

  return (
    <div className={styles.feed}>
      {view.hasEarlier && view.items.length > 0 && (
        <div className={styles.earlier}>
          <Button
            size="touch"
            variant="ghost"
            icon={ArrowUpToLine}
            disabled={loadingEarlier}
            onClick={onLoadEarlier}>
            {t(loadingEarlier ? 'feed.loadingEarlier' : 'feed.earlier')}
          </Button>
        </div>
      )}
      {items.map((item) => (
        <FeedItemView
          key={item.id}
          item={item}
          steps={steps.get(item.id) ?? 0}
          actions={actions}
          onOpenPhoto={photos ? handleOpenPhoto : undefined}
        />
      ))}
      {view.tasks.some((task) => task.state !== 'completed') && <TaskList tasks={view.tasks} />}
      {working && (
        <p className={styles.working}>
          <Spinner size="sm" tone="accent" />
          <span className={styles.workingText}>{working}</span>
        </p>
      )}
      {photos && (
        <PhotoViewer
          agentId={agentId}
          conversationId={view.conversationId}
          photo={photo}
          onClose={() => setPhoto(null)}
        />
      )}
    </div>
  )
}
