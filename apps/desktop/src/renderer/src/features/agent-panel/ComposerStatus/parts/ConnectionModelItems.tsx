import { Plug } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'

import { OPEN_GROUP_MAX } from '../ComposerStatus.constants'
import { useModelPick } from '../ComposerStatus.hooks'
import type { SectionProps } from '../ComposerStatus.types'
import { modelGroups, contextCaption } from '../ComposerStatus.utils'
import { usePickableModels } from '../../models.hooks'
import { usePanelStore } from '../../panel.store'
import { DefaultModelItem } from './DefaultModelItem'

/**
 * Раздел MODEL панели открытых моделей: модели подключений группами по подключению (у
 * OpenRouter их сотни - группа свёрнута, пока выбранная не в ней), у модели - окно контекста, у
 * тесного - предупреждение. Внизу - путь на экран подключений: там добавляют OpenRouter и свой
 * адрес.
 */
export const ConnectionModelItems = ({ conversation, onPicked }: SectionProps) => {
  const { t } = useTranslation()
  const openMenu = usePanelStore((store) => store.openMenu)
  const models = usePickableModels()
  const handlePick = useModelPick(conversation, onPicked)
  const handleConnections = () => openMenu('connections')

  return (
    <>
      <DefaultModelItem conversation={conversation} onPicked={onPicked} />
      {/* Моделей нет - пункт ведёт туда, где их берут. */}
      {models.length === 0 && (
        <MenuItem label={t('openModels.menu.noModels')} onSelect={handleConnections} />
      )}
      {modelGroups(models).map((group) => (
        <MenuSection
          key={group.id}
          title={group.label}
          collapsible
          defaultCollapsed={
            group.models.length > OPEN_GROUP_MAX &&
            !group.models.some((model) => model.value === conversation.model)
          }>
          {group.models.map((model) => (
            <MenuItem
              key={model.value}
              label={model.displayName}
              description={contextCaption(model, t)}
              current={model.value === conversation.model}
              keepOpen={onPicked !== undefined}
              onSelect={() => handlePick(model.value)}
            />
          ))}
        </MenuSection>
      ))}
      <MenuSeparator />
      <MenuItem
        icon={Plug}
        label={t('openModels.menu.connections')}
        description={t('openModels.menu.connectionsHint')}
        onSelect={handleConnections}
      />
    </>
  )
}
