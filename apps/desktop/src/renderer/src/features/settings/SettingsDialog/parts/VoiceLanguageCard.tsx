import { Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { VoiceLanguage, VoiceSettings } from '@shared/voice'
import { VOICE_LANGUAGES, VOICE_PLAY_RATE } from '@shared/voice'

import { Card } from '@agentic-workstation/ui/Card'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { ToggleChip } from '@agentic-workstation/ui/ToggleChip'

import styles from '../SettingsDialog.module.scss'
import type { VoiceCardProps } from '../SettingsDialog.types'
import {
  languageName,
  voiceChoices,
  toggleExpected,
  voicedLanguages,
  languageModeChoices,
} from '../../voice-settings.utils'
import { invoke } from '../../../../lib/ipc'
import { playPcmSample } from '../../../../lib/pcm'
import { useActionNoticeStore } from '../../../../state/action-notice.store'
import { PickButton } from './PickButton'
import { PickRow } from './PickRow'
import { SettingRow } from './SettingRow'

/**
 * Язык и голоса звонка (Settings → Voice): мультиязык или один язык, ожидаемые языки - подсказка
 * Flux, голос на каждый язык с пробой. Язык и голоса встают со следующего звонка.
 */
export const VoiceLanguageCard = ({ settings, onChange }: VoiceCardProps) => {
  const { t } = useTranslation()
  const showNotice = useActionNoticeStore((state) => state.show)

  const handlePreview = async (language: VoiceLanguage) => {
    const sample = await invoke('voice:preview', { language, voice: settings.voices[language] })

    if (sample) playPcmSample(sample.pcm, VOICE_PLAY_RATE)
    else showNotice({ tone: 'danger', title: t('settings.voice.previewFailed') })
  }

  return (
    <Card>
      <div className={styles.rows}>
        <PickRow
          label={t('settings.voice.language')}
          description={t('settings.voice.nextCall')}
          value={settings.languageMode}
          options={languageModeChoices(t)}
          onPick={(mode) =>
            onChange({ ...settings, languageMode: mode as VoiceSettings['languageMode'] })
          }
        />
        {settings.languageMode === 'multi' && (
          <SettingRow
            label={t('settings.voice.expected')}
            description={t('settings.voice.expectedHint')}>
            <div className={styles.chips}>
              {VOICE_LANGUAGES.map((language) => (
                <ToggleChip
                  key={language}
                  label={languageName(language)}
                  pressed={settings.expected.includes(language)}
                  size="sm"
                  onChange={(on) =>
                    onChange({
                      ...settings,
                      expected: toggleExpected(settings.expected, language, on),
                    })
                  }
                />
              ))}
            </div>
          </SettingRow>
        )}
        {voicedLanguages(settings).map((language) => (
          <SettingRow
            key={language}
            label={t('settings.voice.voices')}
            description={languageName(language)}>
            <div className={styles.keyControl}>
              <PickButton
                label={languageName(language)}
                value={settings.voices[language]}
                options={voiceChoices(language)}
                onPick={(voice) =>
                  onChange({ ...settings, voices: { ...settings.voices, [language]: voice } })
                }
              />
              <IconButton
                icon={Play}
                label={t('settings.voice.preview')}
                size="sm"
                onClick={() => void handlePreview(language)}
              />
            </div>
          </SettingRow>
        ))}
      </div>
    </Card>
  )
}
