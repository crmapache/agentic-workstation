import { FolderX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import type { RouteOf } from '../../../lib/route.types'
import { useInventory } from '../../../state/remote.queries'
import { LinkWait } from '../../../shell/LinkWait/LinkWait'
import { Screen } from '../../../shell/Screen/Screen'
import { HistorySection } from './parts/HistorySection'

/**
 * Прошлые разговоры проекта - у каждого провайдера свои (у Claude Code - транскрипты CLI).
 * Открыть - вкладка в IDE и обычный разговор на телефоне: продолжать можно сразу. Только у
 * открытого проекта: разговоры живут во вкладках его окна.
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
      help={{ title: t('history.help.title'), text: t('history.help.text') }}>
      {!inventory && <LinkWait agentId={agentId} label={t('history.loading')} />}
      {inventory && !project?.open && (
        <EmptyState
          icon={FolderX}
          title={t('history.notOpen.title')}
          description={t('history.notOpen.description')}
        />
      )}
      {inventory &&
        project?.open &&
        providers.map((provider) => (
          <HistorySection
            key={provider.id}
            route={route}
            provider={provider}
            inventory={inventory}
          />
        ))}
    </Screen>
  )
}
