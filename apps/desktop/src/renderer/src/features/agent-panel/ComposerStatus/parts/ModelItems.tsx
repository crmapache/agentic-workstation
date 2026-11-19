import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'

import { MAIN_MODELS } from '../ComposerStatus.constants'
import { useModelPick } from '../ComposerStatus.hooks'
import type { SectionProps } from '../ComposerStatus.types'
import { modelIcon } from '../ComposerStatus.utils'
import { usePickableModels } from '../../models.hooks'
import { usePanelCapabilities } from '../../panel.queries'
import { usePanelStore } from '../../panel.store'
import { FastModeItem } from '../../FastModeItem/FastModeItem'
import { DefaultModelItem } from './DefaultModelItem'

/**
 * Раздел MODEL панели индикатора: модель разговора из каталога CLI - основные сразу,
 * старые версии - в свёрнутой группе, свои (прокси, шлюз) - следом с пометкой. «По
 * умолчанию» (как в настройках Claude Code) - под основными, как в разделе Effort: над
 * свёрнутой группой, иначе он читался бы её пунктом. У модели - иконка её семьи, как у
 * режимов в разделе Mode. Внизу - быстрый режим и путь на экран, где свои модели добавляют,
 * если провайдер их умеет.
 * Смена идёт живому процессу, без перезапуска разговора. С onPicked выбор модели ведёт дальше,
 * к её усилию, а не закрывает панель.
 */
export const ModelItems = ({ conversation, onPicked }: SectionProps) => {
  const { t } = useTranslation()
  const { fastMode, customModels } = usePanelCapabilities()
  const openMenu = usePanelStore((store) => store.openMenu)
  const models = usePickableModels()
  const handlePick = useModelPick(conversation, onPicked)
  const toItem = (model: (typeof models)[number]) => (
    <MenuItem
      key={model.value}
      icon={modelIcon(model.value)}
      label={model.displayName}
      description={
        model.custom ? t('agentPanel.customModels.menuCustom') : model.description || undefined
      }
      current={model.value === conversation.model}
      keepOpen={onPicked !== undefined}
      onSelect={() => handlePick(model.value)}
    />
  )
  const items = models.filter((model) => !model.custom).map(toItem)

  return (
    <>
      {items.slice(0, MAIN_MODELS - 1)}
      <DefaultModelItem conversation={conversation} onPicked={onPicked} />
      {items.length >= MAIN_MODELS && (
        <MenuSection title={t('agentPanel.model.other')} collapsible defaultCollapsed>
          {items.slice(MAIN_MODELS - 1)}
        </MenuSection>
      )}
      {models.filter((model) => model.custom).map(toItem)}
      {(fastMode || customModels) && <MenuSeparator />}
      {fastMode && <FastModeItem conversation={conversation} />}
      {customModels && (
        <MenuItem
          icon={Plus}
          label={t('agentPanel.customModels.menuAdd')}
          description={t('agentPanel.customModels.menuAddHint')}
          onSelect={() => openMenu('customModels')}
        />
      )}
    </>
  )
}
