import { FolderX, MessageSquarePlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import type { RouteOf } from '../../../lib/route.types'
import { useRouter } from '../../../lib/router.store'
import { useWatch, useInventory, useLinkStatus } from '../../../state/remote.queries'
import { LinkBadge } from '../../../shell/LinkBadge/LinkBadge'
import { Screen } from '../../../shell/Screen/Screen'
import styles from './ProjectScreen.module.scss'
import { ConversationGroups } from './parts/ConversationGroups'
import { QueueList } from './parts/QueueList'

/**
 * Проект IDE: разговоры по провайдерам (идёт, ждёт тебя, свободен - с какого времени) и очереди
 * сценариев. У недавнего проекта разговоров не видно - только его очереди: сценарии живут на
 * уровне IDE.
 */
export const ProjectScreen = ({ route }: { route: RouteOf<'project'> }) => {
  const { t } = useTranslation()
  const { agentId, projectKey } = route
  const navigate = useRouter((state) => state.navigate)
  const status = useLinkStatus(agentId)
  const inventory = useInventory(agentId).data
  const project = inventory?.projects.find((one) => one.key === projectKey)

  useWatch(agentId, { kind: 'queues', scope: projectKey })

  const handleNew = () => navigate({ name: 'newConversation', agentId, projectKey })

  return (
    <Screen
      title={project?.name ?? t('project.title')}
      subtitle={
        <>
          <LinkBadge status={status} />
          {inventory?.machine.label}
        </>
      }
      actions={
        project?.open && (
          <IconButton
            icon={MessageSquarePlus}
            size="touch"
            label={t('project.newConversation')}
            onClick={handleNew}
          />
        )
      }
      help={{ title: t('project.help.title'), text: t('project.help.text') }}>
      {!inventory && <Spinner size="md" label={t('project.loading')} />}
      {inventory && !project && (
        <EmptyState
          icon={FolderX}
          title={t('project.gone.title')}
          description={t('project.gone.description')}
        />
      )}
      {inventory && project && (
        <>
          {project.open ? (
            <ConversationGroups agentId={agentId} inventory={inventory} project={project} />
          ) : (
            <p className={styles.note}>{t('project.recentNote')}</p>
          )}
          <QueueList agentId={agentId} projectKey={projectKey} canStart={project.open} />
        </>
      )}
    </Screen>
  )
}
