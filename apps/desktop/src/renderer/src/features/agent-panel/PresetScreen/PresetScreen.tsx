import { useTranslation } from 'react-i18next'

import { effortLevelOf } from '@shared/conversation'
import type { SetupPreset } from '@shared/panel-prefs'

import { ChoiceField } from '@agentic-workstation/ui/ChoiceField'

import { useConversationActions } from '../conversation-actions.hooks'
import { usePickableModels } from '../models.hooks'
import { effortLevels } from '../models.utils'
import {
  usePanelPrefs,
  useEffortLevels,
  useModelCatalog,
  usePanelCapabilities,
} from '../panel.queries'
import { usePanelStore } from '../panel.store'
import { withPreset } from '../presets.utils'
import { PanelScreen } from '../PanelScreen/PanelScreen'
import { PRESET_OF_SCREEN } from './PresetScreen.constants'
import styles from './PresetScreen.module.scss'
import { presetChoices } from './PresetScreen.utils'
import { PresetName } from './parts/PresetName'

/**
 * Экран одного пресета (Settings → Quick presets → кнопка, ADR 0096): имя кнопки, модель, усилие
 * и режим, которые она ставит разговору. Каждое поле пишется сразу. Модель, у которой нет
 * выбранного уровня усилия, сбрасывает его к «по умолчанию», как форма задания.
 */
export const PresetScreen = () => {
  const { t } = useTranslation()
  const prefs = usePanelPrefs()
  const screen = usePanelStore((store) => store.menu.screen)
  const { setPrefs } = useConversationActions()
  const catalog = useModelCatalog()
  const capabilities = usePanelCapabilities()
  const models = usePickableModels()
  const index = PRESET_OF_SCREEN[screen] ?? 0
  const preset = prefs.presets[index]
  const efforts = useEffortLevels(preset?.model ?? null)
  const choices = presetChoices(models, { efforts, modes: capabilities.modes }, t)

  const handleChange = (patch: Partial<SetupPreset>) =>
    void setPrefs({ presets: withPreset(prefs.presets, index, patch) })

  const handleModel = (value: string) => {
    const model = value || null
    const levels = effortLevels(catalog, model, capabilities.efforts)
    const effort = preset?.effort && levels.includes(preset.effort) ? preset.effort : null

    handleChange({ model, effort })
  }

  const handleEffort = (value: string) => handleChange({ effort: effortLevelOf(value) })

  const handleMode = (value: string) => {
    const mode = capabilities.modes.find((one) => one === value)

    if (mode) handleChange({ mode })
  }

  if (!preset) return null

  return (
    <PanelScreen title={t(`agentPanel.menu.titles.${screen}.title`)}>
      <div className={styles.form}>
        <PresetName key={index} preset={preset} onChange={handleChange} />
        <ChoiceField
          label={t('agentPanel.status.modelCaption')}
          value={preset.model ?? ''}
          options={choices.model}
          onPick={handleModel}
        />
        <ChoiceField
          label={t('agentPanel.status.effortCaption')}
          value={preset.effort ?? ''}
          options={choices.effort}
          onPick={handleEffort}
        />
        <ChoiceField
          label={t('agentPanel.status.modeCaption')}
          value={preset.mode}
          options={choices.mode}
          onPick={handleMode}
        />
      </div>
    </PanelScreen>
  )
}
