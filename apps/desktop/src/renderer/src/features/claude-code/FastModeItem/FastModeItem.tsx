import { Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { fastModeShown, modelHasFastMode } from '@shared/claude-fast-mode'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { useClaudeActions } from '../claude-actions.hooks'
import { useModelCatalog } from '../claude.queries'
import { fastModeSub } from '../fast-mode.utils'
import type { FastModeItemProps } from './FastModeItem.types'

/**
 * «Fast mode» в меню MODEL (как в ACC): переключатель, а не модель. Opus до 2.5 раза
 * быстрее за счёт usage credits; строка ниже - что с режимом сейчас словами CLI. Только у
 * модели, которая его умеет: на Sonnet переключатель ничего бы не делал.
 */
export const FastModeItem = ({ conversation }: FastModeItemProps) => {
  const { t } = useTranslation()
  const { setOptions } = useClaudeActions()
  const models = useModelCatalog()
  const isAsked = conversation.fastMode === true
  const shown = fastModeShown(conversation.fastMode, conversation.fastReport)

  if (!isAsked && !modelHasFastMode(models, conversation.model)) return null

  const handleToggle = () => void setOptions(conversation.id, { fastMode: !isAsked })

  return (
    <MenuItem
      icon={Zap}
      label={t('claudeCode.fast.label')}
      description={fastModeSub(shown, t)}
      selection="multiple"
      checked={isAsked}
      onSelect={handleToggle}
    />
  )
}
