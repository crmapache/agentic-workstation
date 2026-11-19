import { useTranslation } from 'react-i18next'

import { isModeOff } from '@shared/conversation'
import type { SetupPreset } from '@shared/panel-prefs'

import { ToggleChip } from '@agentic-workstation/ui/ToggleChip'

import styles from '../ComposerStatus.module.scss'
import type { PickerProps } from '../ComposerStatus.types'
import { useConversationActions } from '../../conversation-actions.hooks'
import { usePickableModels } from '../../models.hooks'
import { useModeAvailability } from '../../modes.hooks'
import { usePanelPrefs } from '../../panel.queries'
import { activePreset, shownPresets, presetOptions, presetSummary } from '../../presets.utils'
import { useActiveProject } from '../../../../state/workspace.queries'

/**
 * Пресеты справа от индикатора (ADR 0096): до трёх кнопок, каждая ставит разговору свои модель,
 * усилие и режим одним нажатием. Горит та, чьи модель и усилие сейчас у разговора: сменили их
 * руками мимо пресетов - не горит ни одна. Нажатая снова ставит пресет заново (вернуть режим),
 * а не снимает его. Кнопок нет - и места под них нет.
 */
export const SetupPresets = ({ conversation }: PickerProps) => {
  const { t } = useTranslation()
  const prefs = usePanelPrefs()
  const models = usePickableModels()
  const { setOptions } = useConversationActions()
  const available = useModeAvailability(useActiveProject()?.id, conversation)
  const presets = shownPresets(prefs)
  const active = activePreset(presets, conversation)

  const handlePick = (preset: SetupPreset) => {
    const options = presetOptions(preset, conversation, isModeOff(preset.mode, available))

    if (options) void setOptions(conversation.id, options)
  }

  if (presets.length === 0) return null

  return (
    <div role="group" aria-label={t('agentPanel.presets.group')} className={styles.presets}>
      {presets.map((preset, index) => (
        <ToggleChip
          // Номер - место кнопки: имена двух пресетов могут совпасть.
          key={index}
          size="sm"
          label={preset.name}
          hint={presetSummary(preset, models, t)}
          hintPlacement="top"
          pressed={index === active}
          onChange={() => handlePick(preset)}
        />
      ))}
    </div>
  )
}
