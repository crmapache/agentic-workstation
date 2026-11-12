import { FolderX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import type { RouteOf } from '../../../lib/route.types'
import { useInventory } from '../../../state/remote.queries'
import { LinkWait } from '../../../shell/LinkWait/LinkWait'
import { OpenInIdeButton } from '../../../shell/OpenInIdeButton/OpenInIdeButton'
import { Screen } from '../../../shell/Screen/Screen'
import styles from './HistoryScreen.module.scss'
import { HistorySection } from './parts/HistorySection'

/**
 * Прошлые разговоры проекта - у каждого провайдера свои (у Claude Code - транскрипты CLI).
 * Открыть - вкладка в IDE и обычный разговор на телефоне: продолжать можно сразу. У недавнего
 * проекта список читается, а открыть разговор можно, только открыв проект в IDE: разговоры
 * живут во вкладках его окна - эта кнопка в низу.
 */
export const HistoryScreen = ({ route }: { route: RouteOf<'history'> }) => {
  const { t } = useTranslation()
  const { agentId, projectKey } = route
  const inventory = useInventory(agentId).data
  const project = inventory?.projects.find((one) => one.key === projectKey)
  const providers = inventory?.providers.filter((one) => one.available) ?? []

  return (
    <Screen
      title={t('history.title')}
      subtitle={project?.name}
      agentId={agentId}
      help={{ title: t('history.help.title'), text: t('history.help.text') }}
      footer={
        project && !project.open && <OpenInIdeButton agentId={agentId} projectKey={projectKey} />
      }>
      {!inventory && <LinkWait agentId={agentId} label={t('history.loading')} />}
      {inventory && !project && (
        <EmptyState
          icon={FolderX}
          title={t('project.gone.title')}
          description={t('project.gone.description')}
        />
      )}
      {project && !project.open && <p className={styles.lead}>{t('history.notOpen')}</p>}
      {inventory &&
        project &&
        providers.map((provider) => (
          <HistorySection
            key={provider.id}
            route={route}
            provider={provider}
            inventory={inventory}
            canOpen={project.open}
          />
        ))}
    </Screen>
  )
}
