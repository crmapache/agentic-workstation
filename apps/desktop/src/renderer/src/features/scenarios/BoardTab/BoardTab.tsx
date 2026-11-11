import { Play, ArrowRight, LayoutGrid } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { Section } from '@agentic-workstation/ui/Section'

import { liveOf, canGoTo, boardCounts, boardGroups } from '../scenarios-queues.utils'
import { useScenariosStore } from '../scenarios.store'
import { QueueCard } from '../QueueCard/QueueCard'
import type { ScenariosTabProps } from '../ScenariosView/ScenariosView.types'
import { useScenarioQueues } from '../../../state/scenarios.queries'
import { useWorkspace } from '../../../state/workspace.queries'
import { useGoToProject } from './BoardTab.hooks'
import styles from './BoardTab.module.scss'

/**
 * Доска всех очередей (All queues): открытые очереди всех проектов, сгруппированные по проекту,
 * текущий - первым. Полосы плотные: что идёт, кто ждёт человека, где встало. Имя очереди или
 * «Go to project» ведут к проекту и его вкладке очередей - там полоса целиком.
 */
export const BoardTab = ({ project }: ScenariosTabProps) => {
  const { t } = useTranslation()
  const open = useScenariosStore((state) => state.open)
  const goTo = useGoToProject()
  const { data } = useScenarioQueues()
  const { data: workspace } = useWorkspace()

  // Пока снимка нет, пустота врала бы «очередей нет».
  if (!data) return null

  const groups = boardGroups(data.queues, workspace?.projects ?? [], project.rootPath)
  const counts = boardCounts(data.queues, data.live)
  const recent = workspace?.recentProjects ?? []

  const handleRun = () => open({ kind: 'launch' })

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title={t('scenarios.board.emptyTitle')}
        description={t('scenarios.board.emptyText')}
        action={
          <Button icon={Play} onClick={handleRun}>
            {t('scenarios.board.run')}
          </Button>
        }
      />
    )
  }

  return (
    <div className={styles.board}>
      <div className={styles.summary} role="status" aria-label={t('scenarios.board.summary')}>
        {counts.running > 0 && (
          <Badge tone="warning">{t('scenarios.board.running', { count: counts.running })}</Badge>
        )}
        {counts.waiting > 0 && (
          <Badge tone="accent">{t('scenarios.board.waiting', { count: counts.waiting })}</Badge>
        )}
        {counts.running === 0 && counts.waiting === 0 && (
          <Badge>{t('scenarios.board.quiet')}</Badge>
        )}
      </div>
      {groups.map((group) => {
        const canGo = canGoTo(group, recent)
        const handleGo = () => goTo(group)

        return (
          <Section
            key={group.projectPath}
            title={group.name}
            count={group.queues.length}
            description={group.isCurrent ? t('scenarios.board.current') : undefined}
            actions={
              <Button
                size="sm"
                variant="ghost"
                icon={ArrowRight}
                disabled={!canGo}
                onClick={handleGo}>
                {t('scenarios.board.open')}
              </Button>
            }>
            <div className={styles.grid}>
              {group.queues.map((queue) => (
                <QueueCard
                  key={queue.id}
                  queue={queue}
                  live={liveOf(queue, data.live)}
                  compact
                  onOpen={canGo ? handleGo : undefined}
                />
              ))}
            </div>
          </Section>
        )
      })}
    </div>
  )
}
