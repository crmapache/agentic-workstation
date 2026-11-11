import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'
import { MenuSeparator } from '@agentic-workstation/ui/MenuSeparator'

import { MAIN_MODELS, DEFAULT_CHOICE_ICON } from '../ComposerStatus.constants'
import type { SectionProps } from '../ComposerStatus.types'
import { modelIcon } from '../ComposerStatus.utils'
import { useClaudeActions } from '../../claude-actions.hooks'
import { useClaudeCodeStore } from '../../claude-code.store'
import { usePanelPrefs, useModelCatalog } from '../../claude.queries'
import { pickableModels } from '../../models.utils'
import { FastModeItem } from '../../FastModeItem/FastModeItem'

/**
 * Раздел MODEL панели индикатора: модель разговора из каталога CLI - основные сразу,
 * старые версии - в свёрнутой группе, свои (прокси, шлюз) - следом с пометкой. «По
 * умолчанию» (как в настройках Claude Code) - под основными, как в разделе Effort: над
 * свёрнутой группой, иначе он читался бы её пунктом. У модели - иконка её семьи, как у
 * режимов в разделе Mode. Последний пункт ведёт на экран, где свои модели добавляют.
 * Смена идёт живому процессу, без перезапуска разговора. С onPicked выбор модели ведёт дальше,
 * к её усилию, а не закрывает панель.
 */
export const ModelItems = ({ conversation, onPicked }: SectionProps) => {
  const { t } = useTranslation()
  const { setOptions } = useClaudeActions()
  const prefs = usePanelPrefs()
  const openMenu = useClaudeCodeStore((store) => store.openMenu)
  const models = pickableModels(useModelCatalog(), prefs.customModels)
  const handlePick = (model: string | null) => {
    void setOptions(conversation.id, { model })
    onPicked?.()
  }
  const toItem = (model: (typeof models)[number]) => (
    <MenuItem
      key={model.value}
      icon={modelIcon(model.value)}
      label={model.displayName}
      description={
        model.custom ? t('claudeCode.customModels.menuCustom') : model.description || undefined
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
      <MenuItem
        icon={DEFAULT_CHOICE_ICON}
        label={t('claudeCode.model.default')}
        description={t('claudeCode.model.defaultHint')}
        current={conversation.model === null}
        keepOpen={onPicked !== undefined}
        onSelect={() => handlePick(null)}
      />
      {items.length >= MAIN_MODELS && (
        <MenuSection title={t('claudeCode.model.other')} collapsible defaultCollapsed>
          {items.slice(MAIN_MODELS - 1)}
        </MenuSection>
      )}
      {models.filter((model) => model.custom).map(toItem)}
      <MenuSeparator />
      <FastModeItem conversation={conversation} />
      <MenuItem
        icon={Plus}
        label={t('claudeCode.customModels.menuAdd')}
        description={t('claudeCode.customModels.menuAddHint')}
        onSelect={() => openMenu('customModels')}
      />
    </>
  )
}
