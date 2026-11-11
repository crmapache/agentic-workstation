import { SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import type { RouteOf } from '../../../lib/route.types'
import { LinkWait } from '../../../shell/LinkWait/LinkWait'
import { OpenInIdeButton } from '../../../shell/OpenInIdeButton/OpenInIdeButton'
import { Screen } from '../../../shell/Screen/Screen'
import { useSearchScreen } from './SearchScreen.hooks'
import { SearchFooter } from './parts/SearchFooter'
import { SearchResults } from './parts/SearchResults'

/**
 * Поиск по разговорам проекта: поле и кнопки - в низу под пальцем, находки - над ними. Ищет
 * только открытый проект: у закрытого вместо поиска - открыть его в IDE.
 */
export const SearchScreen = ({ route }: { route: RouteOf<'search'> }) => {
  const { t } = useTranslation()
  const screen = useSearchScreen(route)
  const { inventory, project } = screen
  const offset = inventory ? inventory.at - inventory.receivedAt : 0
  const closed = !!project && !project.open

  return (
    <Screen
      title={t('search.title')}
      subtitle={project?.name}
      agentId={route.agentId}
      help={{ title: t('search.help.title'), text: t('search.help.text') }}
      footer={
        closed ? (
          <OpenInIdeButton agentId={route.agentId} projectKey={route.projectKey} />
        ) : (
          project && <SearchFooter screen={screen} />
        )
      }>
      {!inventory && <LinkWait agentId={route.agentId} label={t('project.loading')} />}
      {inventory && !project && (
        <EmptyState
          icon={SearchX}
          title={t('project.gone.title')}
          description={t('project.gone.description')}
        />
      )}
      {closed && <EmptyState icon={SearchX} title={t('search.notOpen')} />}
      {project?.open && <SearchResults screen={screen} offset={offset} />}
    </Screen>
  )
}
