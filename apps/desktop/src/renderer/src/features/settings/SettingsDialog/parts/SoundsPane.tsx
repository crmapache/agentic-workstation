import { useTranslation } from 'react-i18next'

import type { SoundEvent, SoundPrefs } from '@shared/sounds'
import { SOUND_EVENTS } from '@shared/sounds'

import { Card } from '@agentic-workstation/ui/Card'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Section } from '@agentic-workstation/ui/Section'

import styles from '../SettingsDialog.module.scss'
import { SLIDER_SAVE_MS } from '../../../../lib/delayed-save.constants'
import { useDelayedSave } from '../../../../lib/delayed-save.hooks'
import { playSound } from '../../../../lib/sound-player'
import { useSoundPrefs, useSetSoundPrefs } from '../../../../state/sounds.queries'
import { volumeOf, isSoundOn, toggleSound, setSoundVolume } from '../../../../state/sounds.utils'
import { SoundRow } from './SoundRow'

/**
 * Раздел «Sounds» (ADR 0046): семь поводов, когда разговор зовёт человека, строкой каждый -
 * громкость, проба и переключатель. Ноль и «выключено» - одно и то же, громкость
 * выключенного запоминается. Ползунок пишется с паузой, на экране - сразу.
 */
export const SoundsPane = () => {
  const { t } = useTranslation()
  const saved = useSoundPrefs()
  const save = useSetSoundPrefs()
  const [sounds, setSounds] = useDelayedSave<SoundPrefs>(saved, save, SLIDER_SAVE_MS)

  const handleToggle = (event: SoundEvent) => setSounds(toggleSound(sounds, event))

  const handleVolume = (event: SoundEvent, volume: number) =>
    setSounds(setSoundVolume(sounds, event, volume))

  const handlePreview = (event: SoundEvent) => playSound(event, volumeOf(sounds, event))

  return (
    <Section
      title={t('settings.sections.sounds')}
      description={t('settings.sounds.description')}
      help={
        <HelpButton
          label={t('settings.sounds.help.label')}
          title={t('settings.sections.sounds')}
          text={t('settings.sounds.help.text')}
          closeLabel={t('common.close')}
        />
      }>
      <Card>
        <div className={styles.rows}>
          {SOUND_EVENTS.map((event) => (
            <SoundRow
              key={event}
              event={event}
              isOn={isSoundOn(sounds, event)}
              volume={volumeOf(sounds, event)}
              onToggle={handleToggle}
              onVolume={handleVolume}
              onPreview={handlePreview}
            />
          ))}
        </div>
      </Card>
    </Section>
  )
}
