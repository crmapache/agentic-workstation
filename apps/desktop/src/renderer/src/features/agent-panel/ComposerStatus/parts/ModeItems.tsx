import { useTranslation } from 'react-i18next'

import { isModeOff } from '@shared/conversation'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import type { PickerProps } from '../ComposerStatus.types'
import { useConversationActions } from '../../conversation-actions.hooks'
import { useModeAvailability } from '../../modes.hooks'
import { usePanelCapabilities } from '../../panel.queries'
import { MODE_ICONS } from '../../../../lib/permission-modes.constants'
import { useActiveProject } from '../../../../state/workspace.queries'

/**
 * Раздел MODE панели индикатора: режим разрешений разговора - режимы провайдера (у Claude:
 * спрашивать, принимать правки, план, авто, без вопросов). Shift+Tab переключает их по кругу. Недоступный
 * режим (запрещён настройками или CLI уже отказал) виден, но погашен - как в ACC, вместо
 * отказа после клика.
 */
export const ModeItems = ({ conversation }: PickerProps) => {
  const { t } = useTranslation()
  const { setOptions } = useConversationActions()
  const available = useModeAvailability(useActiveProject()?.id, conversation)
  const { modes } = usePanelCapabilities()
  const mode = conversation.permissionMode

  return modes.map((item) => (
    <MenuItem
      key={item}
      icon={MODE_ICONS[item]}
      label={t(`agentPanel.modes.labels.${item}`)}
      description={t(`agentPanel.modes.hints.${item}`)}
      current={item === mode}
      disabled={item !== mode && isModeOff(item, available)}
      onSelect={() => void setOptions(conversation.id, { permissionMode: item })}
    />
  ))
}
