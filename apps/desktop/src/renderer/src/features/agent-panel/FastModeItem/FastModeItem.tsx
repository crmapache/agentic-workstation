import { Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { fastModeShown, modelHasFastMode, isFastModeChecked } from '@shared/fast-mode'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { useConversationActions } from '../conversation-actions.hooks'
import { fastModeSub } from '../fast-mode.utils'
import { useModelCatalog } from '../panel.queries'
import type { FastModeItemProps } from './FastModeItem.types'

/**
 * «Fast mode» в меню MODEL (как в ACC): переключатель, а не модель. Быстрее за счёт лимитов
 * или usage credits; строка ниже - что с режимом сейчас словами CLI. Только у модели, которая
 * его умеет: на Sonnet переключатель ничего бы не делал. Включён по показанному: режим из
 * настроек CLI выключается здесь для этого разговора.
 */
export const FastModeItem = ({ conversation }: FastModeItemProps) => {
  const { t } = useTranslation()
  const { setOptions } = useConversationActions()
  const models = useModelCatalog()
  const shown = fastModeShown(conversation.fastMode, conversation.fastReport)
  const isChecked = isFastModeChecked(conversation.fastMode, conversation.fastReport)

  if (!isChecked && !modelHasFastMode(models, conversation.model)) return null

  const handleToggle = () => void setOptions(conversation.id, { fastMode: !isChecked })

  return (
    <MenuItem
      icon={Zap}
      label={t('agentPanel.fast.label')}
      description={fastModeSub(shown, t)}
      selection="multiple"
      checked={isChecked}
      onSelect={handleToggle}
    />
  )
}
