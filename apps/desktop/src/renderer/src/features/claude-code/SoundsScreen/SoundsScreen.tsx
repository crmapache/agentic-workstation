import { useTranslation } from 'react-i18next'

import type { SoundEvent } from '@shared/claude-prefs'
import { SOUND_EVENTS } from '@shared/claude-prefs'

import { Card } from '@agentic-workstation/ui/Card'

import { useClaudeActions } from '../claude-actions.hooks'
import { usePanelPrefs } from '../claude.queries'
import { useDelayedSave } from '../delayed-save.hooks'
import { SLIDER_SAVE_MS } from '../panel-look.constants'
import { playSound } from '../sounds.hooks'
import type { SoundPrefs } from '../sounds.utils'
import { volumeOf, isSoundOn, toggleSound, setSoundVolume } from '../sounds.utils'
import { PanelScreen } from '../PanelScreen/PanelScreen'
import styles from './SoundsScreen.module.scss'
import { SoundRow } from './parts/SoundRow'

/**
 * Звуки (Settings → Sound alerts): семь поводов, когда панель зовёт человека, у каждого
 * переключатель, громкость и проба. Ноль и «выключено» - одно и то же, громкость
 * выключенного запоминается. Ползунок пишется с паузой, на экране - сразу.
 */
export const SoundsScreen = () => {
  const { t } = useTranslation()
  const prefs = usePanelPrefs()
  const { setPrefs } = useClaudeActions()
  const [sounds, setSounds] = useDelayedSave<SoundPrefs>(
    { mutedSounds: prefs.mutedSounds, soundVolumes: prefs.soundVolumes },
    (next) => setPrefs(next),
    SLIDER_SAVE_MS,
  )

  const handleToggle = (event: SoundEvent) => setSounds(toggleSound(sounds, event))

  const handleVolume = (event: SoundEvent, volume: number) =>
    setSounds(setSoundVolume(sounds, event, volume))

  const handlePreview = (event: SoundEvent) => playSound(event, volumeOf(sounds, event))

  return (
    <PanelScreen title={t('claudeCode.menu.titles.sounds.title')}>
      <Card>
        <div className={styles.sounds}>
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
    </PanelScreen>
  )
}
