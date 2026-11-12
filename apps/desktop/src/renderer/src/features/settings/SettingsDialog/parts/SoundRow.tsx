import { Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Slider } from '@agentic-workstation/ui/Slider'
import { Switch } from '@agentic-workstation/ui/Switch'

import styles from '../SettingsDialog.module.scss'
import type { SoundRowProps } from '../SettingsDialog.types'
import { SettingRow } from './SettingRow'

/**
 * Повод звука одной строкой: что за повод, громкость, «сыграть» и переключатель. Ползунок -
 * он же переключатель: в ноль - выключено, поднятый - включено. Отпустили ползунок - звук
 * играет пробой: услышать, насколько тише, а не гадать.
 */
export const SoundRow = ({ event, isOn, volume, onToggle, onVolume, onPreview }: SoundRowProps) => {
  const { t } = useTranslation()
  const label = t(`settings.sounds.events.${event}.label`)

  return (
    <SettingRow
      label={label}
      description={t(`settings.sounds.events.${event}.hint`)}
      dimmed={!isOn}>
      <div className={styles.control}>
        <Slider
          label={t('settings.sounds.volume', { sound: label })}
          hideLabel
          value={volume}
          min={0}
          max={100}
          valueText={
            isOn ? t('settings.sounds.percent', { value: volume }) : t('settings.sounds.muted')
          }
          onChange={(value) => onVolume(event, value)}
          onChangeEnd={() => onPreview(event)}
        />
      </div>
      <IconButton
        icon={Play}
        size="sm"
        label={t('settings.sounds.play', { sound: label })}
        onClick={() => onPreview(event)}
      />
      <Switch label={label} labelHidden checked={isOn} onChange={() => onToggle(event)} />
    </SettingRow>
  )
}
