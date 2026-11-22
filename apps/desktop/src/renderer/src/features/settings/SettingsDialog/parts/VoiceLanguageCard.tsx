import { useTranslation } from 'react-i18next'

import type { VoiceSettings } from '@shared/voice'
import { VOICE_LANGUAGES } from '@shared/voice'

import { Card } from '@agentic-workstation/ui/Card'
import { ToggleChip } from '@agentic-workstation/ui/ToggleChip'

import styles from '../SettingsDialog.module.scss'
import type { VoiceCardProps } from '../SettingsDialog.types'
import { useVoicePreview } from '../../voice-preview.hooks'
import {
  languageName,
  voiceChoices,
  toggleExpected,
  voicedLanguages,
  languageModeChoices,
} from '../../voice-settings.utils'
import { PickButton } from './PickButton'
import { PickRow } from './PickRow'
import { SettingRow } from './SettingRow'
import { VoicePreviewButton } from './VoicePreviewButton'

/**
 * Язык и голоса звонка (Settings → Voice): мультиязык или один язык, ожидаемые языки - подсказка
 * Flux, голос на каждый язык с пробой. Язык и голоса встают со следующего звонка.
 */
export const VoiceLanguageCard = ({ settings, onChange }: VoiceCardProps) => {
  const { t } = useTranslation()
  const { preview, toggle } = useVoicePreview(settings.voices)

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
            label={t('settings.voice.voiceFor', { language: languageName(language) })}>
            <div className={styles.keyControl}>
              <PickButton
                label={languageName(language)}
                value={settings.voices[language]}
                options={voiceChoices(language)}
                onPick={(voice) =>
                  onChange({ ...settings, voices: { ...settings.voices, [language]: voice } })
                }
              />
              <VoicePreviewButton
                phase={preview?.language === language ? preview.phase : null}
                onToggle={() => void toggle(language)}
              />
            </div>
          </SettingRow>
        ))}
      </div>
    </Card>
  )
}
