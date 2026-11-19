import { useTranslation } from 'react-i18next'

import { ChoiceField } from '@agentic-workstation/ui/ChoiceField'
import { Menu } from '@agentic-workstation/ui/Menu'
import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { useConversationActions } from '../conversation-actions.hooks'
import { usePickableModels } from '../models.hooks'
import { usePanelPrefs } from '../panel.queries'
import { usePanelStore } from '../panel.store'
import type { MenuScreenProps } from '../panel.types'
import { presetsFor, shownPresets, presetSummary } from '../presets.utils'
import { DEFAULT_CHOICE_ICON } from '../ComposerStatus/ComposerStatus.constants'
import { modelIcon } from '../ComposerStatus/ComposerStatus.utils'
import { PanelScreen } from '../PanelScreen/PanelScreen'
import { PRESET_COUNTS, PRESET_SCREENS } from './PresetsScreen.constants'
import styles from './PresetsScreen.module.scss'

/**
 * Settings → Quick presets (ADR 0096): сколько кнопок пресетов стоит под полем - ни одной или до
 * трёх, - и строка каждого пресета с экраном за ней, с иконкой его модели, как в меню модели.
 * Новая кнопка берёт модель, усилие и режим выбранной вкладки; убранная хранит свой пресет.
 */
export const PresetsScreen = ({ conversation }: MenuScreenProps) => {
  const { t } = useTranslation()
  const prefs = usePanelPrefs()
  const models = usePickableModels()
  const pickMenu = usePanelStore((store) => store.pickMenu)
  const { setPrefs } = useConversationActions()
  const shown = shownPresets(prefs)
  const counts = PRESET_COUNTS.map((count) => ({
    value: String(count),
    label: count > 0 ? t('agentPanel.presets.count', { count }) : t('agentPanel.presets.none'),
  }))

  const handleCount = (value: string) => {
    const count = Number(value)
    const presets = presetsFor(prefs.presets, count, conversation, (number) =>
      t('agentPanel.presets.defaultName', { number }),
    )

    void setPrefs({ presetCount: count, presets })
  }

  return (
    <PanelScreen title={t('agentPanel.menu.titles.presets.title')}>
      <div className={styles.count}>
        <ChoiceField
          label={t('agentPanel.presets.countLabel')}
          value={String(prefs.presetCount)}
          options={counts}
          onPick={handleCount}
        />
      </div>
      {shown.length > 0 && (
        <Menu label={t('agentPanel.presets.list')}>
          {shown.map((preset, index) => (
            <MenuItem
              // Номер - место кнопки: имена двух пресетов могут совпасть.
              key={index}
              icon={preset.model ? modelIcon(preset.model) : DEFAULT_CHOICE_ICON}
              label={preset.name}
              description={presetSummary(preset, models, t, true)}
              chevron
              onSelect={() => pickMenu(PRESET_SCREENS[index] ?? 'presets')}
            />
          ))}
        </Menu>
      )}
    </PanelScreen>
  )
}
