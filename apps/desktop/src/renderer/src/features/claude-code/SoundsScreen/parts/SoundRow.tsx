import { Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Slider } from '@agentic-workstation/ui/Slider'
import { Switch } from '@agentic-workstation/ui/Switch'

import styles from '../SoundsScreen.module.scss'
import type { SoundRowProps } from '../SoundsScreen.types'

/**
 * Повод звука: переключатель с пояснением, громкость и «сыграть». Ползунок - он же
 * переключатель: в ноль - выключено, поднятый - включено. Отпустили ползунок - звук
 * играет пробой: услышать, насколько тише, а не гадать.
 */
export const SoundRow = ({ event, isOn, volume, onToggle, onVolume, onPreview }: SoundRowProps) => {
  const { t } = useTranslation()
  const label = t(`claudeCode.sounds.events.${event}.label`)

  return (
    <div className={styles.sound}>
      <Switch
        label={label}
        description={t(`claudeCode.sounds.events.${event}.hint`)}
        checked={isOn}
        onChange={() => onToggle(event)}
      />
      <div className={styles.volume}>
        <div className={styles.slider}>
          <Slider
            label={t('claudeCode.sounds.volume', { sound: label })}
            hideLabel
            value={volume}
            min={0}
            max={100}
            valueText={
              isOn
                ? t('claudeCode.sounds.percent', { value: volume })
                : t('claudeCode.sounds.muted')
            }
            onChange={(value) => onVolume(event, value)}
            onChangeEnd={() => onPreview(event)}
          />
        </div>
        <IconButton
          icon={Play}
          size="sm"
          label={t('claudeCode.sounds.play', { sound: label })}
          onClick={() => onPreview(event)}
        />
      </div>
    </div>
  )
}
