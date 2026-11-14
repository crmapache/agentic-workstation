import { Play, ListOrdered } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { liveOf, queueGroups } from '../scenarios-queues.utils'
import { useScenariosStore } from '../scenarios.store'
import { QueueCard } from '../QueueCard/QueueCard'
import type { ScenariosTabProps } from '../ScenariosView/ScenariosView.types'
import { useScenarioQueues } from '../../../state/scenarios.queries'
import { useWorkspace } from '../../../state/workspace.queries'
import styles from './QueuesTab.module.scss'
import { OtherProjects } from './parts/OtherProjects'

/**
 * Все открытые очереди IDE одной вкладкой: очереди текущего проекта - полосами одна под другой,
 * каждая со своим управлением; ниже - очереди других проектов плотными карточками по проектам.
 * Своих нет - приглашение запустить сценарий: запуск и есть способ завести очередь.
 */
export const QueuesTab = ({ project }: ScenariosTabProps) => {
  const { t } = useTranslation()
  const open = useScenariosStore((state) => state.open)
  const { data } = useScenarioQueues()
  const { data: workspace } = useWorkspace()

  // Пока снимка нет, пустота врала бы «очередей нет».
  if (!data) return null

  const mine = data.queues.filter((queue) => queue.projectPath === project.rootPath)
  const others = queueGroups(data.queues, workspace?.projects ?? [], project.rootPath).filter(
    (group) => !group.isCurrent,
  )

  const handleRun = () => open({ kind: 'launch' })

  return (
    <div className={styles.queuesTab}>
      {mine.length > 0 ? (
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
      )}
      {others.length > 0 && (
        <OtherProjects groups={others} live={data.live} recent={workspace?.recentProjects ?? []} />
      )}
    </div>
  )
}
