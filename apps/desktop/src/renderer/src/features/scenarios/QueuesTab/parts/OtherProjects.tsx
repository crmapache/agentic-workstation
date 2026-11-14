import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Section } from '@agentic-workstation/ui/Section'

import { useGoToProject } from '../QueuesTab.hooks'
import styles from '../QueuesTab.module.scss'
import type { OtherProjectsProps } from '../QueuesTab.types'
import { liveOf, canGoTo } from '../../scenarios-queues.utils'
import { QueueCard } from '../../QueueCard/QueueCard'

/**
 * Очереди других проектов - под очередями текущего: по проекту на подраздел, плотными
 * карточками. Отсюда видно, что идёт и кто ждёт ответа во всех проектах, не переключаясь;
 * имя очереди или «Go to project» ведут к проекту, где её полоса - целиком.
 */
export const OtherProjects = ({ groups, live, recent }: OtherProjectsProps) => {
  const { t } = useTranslation()
  const goTo = useGoToProject()
  const count = groups.reduce((sum, group) => sum + group.queues.length, 0)

  return (
    <Section title={t('scenarios.queues.others.title')} count={count}>
      <div className={styles.projects}>
        {groups.map((group) => {
          const canGo = canGoTo(group, recent)
          const handleGo = () => goTo(group)

          return (
            <Section
              key={group.projectPath}
              size="sm"
              title={group.name}
              count={group.queues.length}
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  icon={ArrowRight}
                  disabled={!canGo}
                  onClick={handleGo}>
                  {t('scenarios.queues.others.open')}
                </Button>
              }>
              <div className={styles.grid}>
                {group.queues.map((queue) => (
                  <QueueCard
                    key={queue.id}
                    queue={queue}
                    live={liveOf(queue, live)}
                    compact
                    onOpen={canGo ? handleGo : undefined}
                  />
                ))}
              </div>
            </Section>
          )
        })}
      </div>
    </Section>
  )
}
