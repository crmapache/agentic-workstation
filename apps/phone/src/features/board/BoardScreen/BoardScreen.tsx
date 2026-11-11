import { LayoutGrid } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ALL_PROJECTS } from '@agentic-workstation/remote-protocol/project-key'
import { Badge } from '@agentic-workstation/ui/Badge'
import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { Section } from '@agentic-workstation/ui/Section'

import { boardCounts, boardGroups } from '../../../lib/queues.utils'
import type { RouteOf } from '../../../lib/route.types'
import { useRouter } from '../../../lib/router.store'
import { useWatch, useQueues, useInventory } from '../../../state/remote.queries'
import { LinkWait } from '../../../shell/LinkWait/LinkWait'
import { ListGroup } from '../../../shell/ListGroup/ListGroup'
import { QueueRow } from '../../../shell/QueueRow/QueueRow'
import { Screen } from '../../../shell/Screen/Screen'
import styles from './BoardScreen.module.scss'

/**
 * Доска всех очередей машины (All queues в IDE): открытые очереди всех проектов по проектам и
 * сводка - что идёт, что ждёт человека. Строка ведёт в экран очереди; проект закрыт - очередь
 * всё равно видна: сценарии живут на уровне IDE.
 */
export const BoardScreen = ({ route }: { route: RouteOf<'board'> }) => {
  const { t } = useTranslation()
  const { agentId } = route
  const navigate = useRouter((state) => state.navigate)
  const inventory = useInventory(agentId).data
  const message = useQueues(agentId, ALL_PROJECTS).data

  useWatch(agentId, { kind: 'queues', scope: ALL_PROJECTS })

  const order = inventory?.projects.map((project) => project.key) ?? []
  const groups = message ? boardGroups(message.queues, message.live, order) : []
  const counts = message ? boardCounts(message.queues, message.live) : null

  return (
    <Screen
      title={t('board.title')}
      subtitle={inventory?.machine.label}
      agentId={agentId}
      help={{ title: t('board.help.title'), text: t('board.help.text') }}>
      {!message && <LinkWait agentId={agentId} label={t('project.loadingQueues')} />}
      {message && groups.length === 0 && (
        <EmptyState
          icon={LayoutGrid}
          title={t('board.empty.title')}
          description={t('board.empty.description')}
        />
      )}
      {counts && groups.length > 0 && (
        <div className={styles.summary} role="status" aria-label={t('board.summary')}>
          {counts.running > 0 && (
            <Badge tone="warning">{t('board.running', { count: counts.running })}</Badge>
          )}
          {counts.waiting > 0 && (
            <Badge tone="accent">{t('board.waiting', { count: counts.waiting })}</Badge>
          )}
          {counts.running === 0 && counts.waiting === 0 && <Badge>{t('board.quiet')}</Badge>}
        </div>
      )}
      {groups.map((group) => (
        <Section key={group.projectKey} size="sm" title={group.name} count={group.queues.length}>
          <ListGroup label={group.name}>
            {group.queues.map((queue) => (
              <QueueRow
                key={queue.id}
                queue={queue}
                run={message?.live.find((one) => one.queueId === queue.id)}
                onOpen={() =>
                  navigate({
                    name: 'queue',
                    agentId,
                    projectKey: queue.projectKey,
                    queueId: queue.id,
                  })
                }
              />
            ))}
          </ListGroup>
        </Section>
      ))}
    </Screen>
  )
}
