import { useTranslation } from 'react-i18next'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { EFFORT_ICONS, EFFORT_MENU_ORDER, DEFAULT_CHOICE_ICON } from '../ComposerStatus.constants'
import type { PickerProps } from '../ComposerStatus.types'
import { useClaudeActions } from '../../claude-actions.hooks'

/**
 * Раздел EFFORT панели индикатора: сколько модель думает перед ответом, сильнейший уровень
 * сверху. «По умолчанию» (как в настройках Claude Code) - последним, как в разделе Model:
 * это отказ от выбора, а не ступень шкалы. Уровень - иконкой по смыслу, как режимы в Mode.
 */
export const EffortItems = ({ conversation }: PickerProps) => {
  const { t } = useTranslation()
  const { setOptions } = useClaudeActions()

  return (
    <>
      {EFFORT_MENU_ORDER.map((level) => (
        <MenuItem
          key={level}
          icon={EFFORT_ICONS[level]}
          label={t(`claudeCode.effort.levels.${level}`)}
          description={t(`claudeCode.effort.hints.${level}`)}
          current={level === conversation.effort}
          onSelect={() => void setOptions(conversation.id, { effort: level })}
        />
      ))}
      <MenuItem
        icon={DEFAULT_CHOICE_ICON}
        label={t('claudeCode.effort.default')}
        description={t('claudeCode.effort.defaultHint')}
        current={conversation.effort === null}
        onSelect={() => void setOptions(conversation.id, { effort: null })}
      />
    </>
  )
}
