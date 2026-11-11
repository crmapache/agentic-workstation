import { useMemo } from 'react'
import { MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { FeedView } from '@agentic-workstation/remote-protocol/feed'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import styles from './Feed.module.scss'
import { topLevel, innerSteps } from './Feed.utils'
import { FeedItemView } from './parts/FeedItemView'
import { TaskList } from './parts/TaskList'

/**
 * Лента разговора на телефоне: снимок последних элементов и живые заплатки, свой лёгкий рендер.
 * То, что случилось внутри субагентов, - числом шагов на строке его вызова.
 */
export const Feed = ({ view, working }: { view: FeedView | undefined; working: string | null }) => {
  const { t } = useTranslation()
  const items = useMemo(() => (view ? topLevel(view.items) : []), [view])
  const steps = useMemo(() => (view ? innerSteps(view.items) : new Map<string, number>()), [view])

  if (!view) return <Spinner size="md" label={t('conversation.loading')} />

  if (items.length === 0 && !working) {
    return <EmptyState icon={MessageSquare} title={t('conversation.empty')} />
  }

  return (
    <div className={styles.feed}>
      {view.hasEarlier && <p className={styles.event}>{t('feed.earlier')}</p>}
      {items.map((item) => (
        <FeedItemView key={item.id} item={item} steps={steps.get(item.id) ?? 0} />
      ))}
      {view.tasks.some((task) => task.state !== 'completed') && <TaskList tasks={view.tasks} />}
      {working && (
        <p className={styles.working}>
          <Spinner size="sm" tone="accent" />
          <span className={styles.workingText}>{working}</span>
        </p>
      )}
    </div>
  )
}
