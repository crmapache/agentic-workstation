import { useTranslation } from 'react-i18next'

import { Section } from '@agentic-workstation/ui/Section'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import { openQueues } from '../../../../lib/queues.utils'
import { useRouter } from '../../../../lib/router.store'
import { useQueues } from '../../../../state/remote.queries'
import { ListGroup } from '../../../../shell/ListGroup/ListGroup'
import { QueueRow } from '../../../../shell/QueueRow/QueueRow'

/**
 * Очереди сценариев проекта: папка, сколько ждёт, идущий прогон и вопрос к человеку. Запуск
 * сценария - в низу экрана, под пальцем.
 */
export const QueueList = ({ agentId, projectKey }: { agentId: string; projectKey: string }) => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)
  const message = useQueues(agentId, projectKey).data
  const queues = message ? openQueues(message.queues, message.live) : []

  return (
    <Section
      size="sm"
      title={t('project.queues')}
      count={message ? queues.length : undefined}
      description={message && queues.length === 0 ? t('project.noQueues') : undefined}>
      {!message && <Spinner size="md" label={t('project.loadingQueues')} />}
      {queues.length > 0 && (
        <ListGroup label={t('project.queues')}>
          {queues.map((queue) => (
            <QueueRow
              key={queue.id}
              queue={queue}
              run={message?.live.find((one) => one.queueId === queue.id)}
              onOpen={() => navigate({ name: 'queue', agentId, projectKey, queueId: queue.id })}
            />
          ))}
        </ListGroup>
      )}
    </Section>
  )
}
