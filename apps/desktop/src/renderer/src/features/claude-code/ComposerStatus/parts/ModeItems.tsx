import { useTranslation } from 'react-i18next'

import { PERMISSION_MODES } from '@shared/claude'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { MODE_ICONS } from '../ComposerStatus.constants'
import type { PickerProps } from '../ComposerStatus.types'
import { useClaudeActions } from '../../claude-actions.hooks'
import { useModeAvailability } from '../../modes.hooks'
import { isModeOff } from '../../pane-keys.utils'
import { useActiveProject } from '../../../../state/workspace.queries'

/**
 * Раздел MODE панели индикатора: режим разрешений разговора - спрашивать, принимать
 * правки, план, авто, без вопросов. Shift+Tab переключает режимы по кругу. Недоступный
 * режим (запрещён настройками или CLI уже отказал) виден, но погашен - как в ACC, вместо
 * отказа после клика.
 */
export const ModeItems = ({ conversation }: PickerProps) => {
  const { t } = useTranslation()
  const { setOptions } = useClaudeActions()
  const available = useModeAvailability(useActiveProject()?.id, conversation)
  const mode = conversation.permissionMode

  return PERMISSION_MODES.map((item) => (
    <MenuItem
      key={item}
      icon={MODE_ICONS[item]}
      label={t(`claudeCode.modes.labels.${item}`)}
      description={t(`claudeCode.modes.hints.${item}`)}
      current={item === mode}
      disabled={item !== mode && isModeOff(item, available)}
      onSelect={() => void setOptions(conversation.id, { permissionMode: item })}
    />
  ))
}
