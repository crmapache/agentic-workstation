import { FolderX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import type { RouteOf } from '../../../lib/route.types'
import { useWatch, useInventory, useLinkStatus } from '../../../state/remote.queries'
import { LinkBadge } from '../../../shell/LinkBadge/LinkBadge'
import { LinkWait } from '../../../shell/LinkWait/LinkWait'
import { OpenInIdeButton } from '../../../shell/OpenInIdeButton/OpenInIdeButton'
import { Screen } from '../../../shell/Screen/Screen'
import { StatusLine } from '../../../shell/StatusLine/StatusLine'
import styles from './ProjectScreen.module.scss'
import { ConversationGroups } from './parts/ConversationGroups'
import { ProjectFooter } from './parts/ProjectFooter'
import { ProjectLinks } from './parts/ProjectLinks'
import { QueueList } from './parts/QueueList'

/**
 * Проект IDE: разговоры по провайдерам (идёт, ждёт тебя, свободен - с какого времени), прошлые
 * разговоры, поиск по ним, сценарии и очереди; новый разговор и запуск сценария - в низу, под
 * пальцем. У недавнего проекта разговоров не видно - только история и очереди (сценарии живут
 * на уровне IDE), а в низу - открыть его в IDE.
 */
export const ProjectScreen = ({ route }: { route: RouteOf<'project'> }) => {
  const { t } = useTranslation()
  const { agentId, projectKey } = route
  const status = useLinkStatus(agentId)
  const inventory = useInventory(agentId).data
  const project = inventory?.projects.find((one) => one.key === projectKey)

  useWatch(agentId, { kind: 'queues', scope: projectKey })

  return (
    <Screen
      title={project?.name ?? t('project.title')}
      subtitle={
        <StatusLine badge={<LinkBadge status={status} />} text={inventory?.machine.label} />
      }
      agentId={agentId}
      help={{ title: t('project.help.title'), text: t('project.help.text') }}
      footer={
        project &&
        (project.open ? (
          <ProjectFooter agentId={agentId} projectKey={projectKey} />
        ) : (
          <OpenInIdeButton agentId={agentId} projectKey={projectKey} />
        ))
      }>
      {!inventory && <LinkWait agentId={agentId} label={t('project.loading')} />}
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
          <ProjectLinks agentId={agentId} projectKey={projectKey} open={project.open} />
          <QueueList agentId={agentId} projectKey={projectKey} />
        </>
      )}
    </Screen>
  )
}
