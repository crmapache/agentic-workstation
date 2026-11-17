import { Play, ListOrdered } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { liveOf, projectQueues } from '../scenarios-queues.utils'
import { useScenariosStore } from '../scenarios.store'
import { QueueCard } from '../QueueCard/QueueCard'
import type { ScenariosTabProps } from '../ScenariosView/ScenariosView.types'
import { useScenarioQueues } from '../../../state/scenarios.queries'
import styles from './QueuesTab.module.scss'

/**
 * Очереди текущего проекта полосами одна под другой, каждая со своим управлением (ADR 0072):
 * очередей других проектов здесь нет - они на своих проектах. Нет очередей - приглашение
 * запустить сценарий: запуск и есть способ завести очередь.
 */
export const QueuesTab = ({ project }: ScenariosTabProps) => {
  const { t } = useTranslation()
  const open = useScenariosStore((state) => state.open)
  const { data } = useScenarioQueues()

  // Пока снимка нет, пустота врала бы «очередей нет».
  if (!data) return null

  const mine = projectQueues(data, project.rootPath)

  const handleRun = () => open({ kind: 'launch' })

  return mine.length > 0 ? (
    <div className={styles.list} role="list" aria-label={t('scenarios.queues.listLabel')}>
      {mine.map((queue) => (
        <div key={queue.id} role="listitem">
          <QueueCard queue={queue} live={liveOf(queue, data.live)} />
        </div>
      ))}
    </div>
  ) : (
    <EmptyState
      icon={ListOrdered}
      title={t('scenarios.queues.emptyTitle')}
      description={t('scenarios.queues.emptyText')}
      action={
        <Button icon={Play} onClick={handleRun}>
          {t('scenarios.queues.run')}
        </Button>
      }
    />
  )
}
