import { Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Section } from '@agentic-workstation/ui/Section'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { openQueues, waitingCount } from '../ProjectScreen.utils'
import { useRouter } from '../../../../lib/router.store'
import { RUN_TONES } from '../../../../lib/status.constants'
import { useQueues } from '../../../../state/remote.queries'
import { ListGroup } from '../../../../shell/ListGroup/ListGroup'
import { ListRow } from '../../../../shell/ListRow/ListRow'

/** Очереди сценариев проекта: папка, сколько ждёт, идущий прогон и вопрос к человеку. */
export const QueueList = ({
  agentId,
  projectKey,
  canStart,
}: {
  agentId: string
  projectKey: string
  canStart: boolean
}) => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)
  const message = useQueues(agentId, projectKey).data
  const queues = message ? openQueues(message.queues, message.live) : []

  return (
    <Section
      size="sm"
      title={t('project.queues')}
      count={message ? queues.length : undefined}
      description={message && queues.length === 0 ? t('project.noQueues') : undefined}
      actions={
        canStart && (
          <IconButton
            icon={Play}
            size="touch"
            label={t('project.startScenario')}
            onClick={() => navigate({ name: 'startScenario', agentId, projectKey })}
          />
        )
      }>
      {!message && <Spinner size="md" label={t('project.loadingQueues')} />}
      {queues.length > 0 && (
        <ListGroup label={t('project.queues')}>
          {queues.map((queue) => {
            const run = message?.live.find((one) => one.queueId === queue.id)
            const where =
              queue.workdir.kind === 'worktree' ? queue.workdir.gitBranch : t('queue.projectFolder')
            const facts = [
              where,
              run ? `${run.scenarioName} ${run.done}/${run.total}` : null,
              t('project.waitingItems', { count: waitingCount(queue) }),
            ]

            return (
              <ListRow
                key={queue.id}
                title={queue.name}
                description={facts.filter(Boolean).join(' · ')}
                trailing={
                  run?.asking ? (
                    <Badge tone="accent" variant="soft">
                      {t('machines.needsYou')}
                    </Badge>
                  ) : run ? (
                    <Badge tone={RUN_TONES[run.state] ?? 'neutral'}>
                      {t(`runState.${run.state}`)}
                    </Badge>
                  ) : queue.hold ? (
                    <Badge tone="warning">{t('queue.held')}</Badge>
                  ) : undefined
                }
                onClick={() => navigate({ name: 'queue', agentId, projectKey, queueId: queue.id })}
              />
            )
          })}
        </ListGroup>
      )}
    </Section>
  )
}
