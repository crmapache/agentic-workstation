import { useTranslation } from 'react-i18next'

import type { VoiceSettings } from '@shared/voice'
import { VOICE_SPEED_MAX, VOICE_SPEED_MIN, VOICE_SPEED_STEP } from '@shared/voice'

import { Card } from '@agentic-workstation/ui/Card'
import { Section } from '@agentic-workstation/ui/Section'
import { Slider } from '@agentic-workstation/ui/Slider'
import { Switch } from '@agentic-workstation/ui/Switch'

import styles from '../SettingsDialog.module.scss'
import { regionChoices, bargeInChoices, permissionChoices } from '../../voice-settings.utils'
import { providerChoices } from '../../../../lib/provider-choices'
import { useProviders } from '../../../../state/providers.queries'
import { useVoice, useSetVoiceSettings } from '../../../../state/voice.queries'
import { PickRow } from './PickRow'
import { SettingRow } from './SettingRow'
import { VoiceKeyRow } from './VoiceKeyRow'
import { VoiceLanguageCard } from './VoiceLanguageCard'

/**
 * Раздел «Voice» (ADR 0104): включить голосовой режим и ключ Deepgram - первыми, как велит
 * спецификация; язык и голоса; поведение звонка - скорость, перебивание, разрешения, провайдер,
 * регион. Скорость и перебивание - со следующей фразы, остальное - со следующего звонка.
 */
export const VoicePane = () => {
  const { t } = useTranslation()
  const voice = useVoice()
  const save = useSetVoiceSettings()
  const providers = useProviders().data ?? []

  if (!voice) return null

  const { settings } = voice
  const handleChange = (next: VoiceSettings) => void save(next)

  return (
    <Section title={t('settings.sections.voice')} description={t('settings.voice.description')}>
      <Card>
        <div className={styles.rows}>
          <SettingRow
            label={t('settings.voice.enabled')}
            description={t('settings.voice.enabledHint')}>
            <Switch
              label={t('settings.voice.enabled')}
              labelHidden
              checked={settings.enabled}
              onChange={(enabled) => handleChange({ ...settings, enabled })}
            />
          </SettingRow>
          <VoiceKeyRow />
        </div>
        <p className={styles.footnote}>{t('settings.voice.keyHelp')}</p>
      </Card>
      <VoiceLanguageCard settings={settings} onChange={handleChange} />
      <Card>
        <div className={styles.rows}>
          <SettingRow label={t('settings.voice.speed')}>
            <div className={styles.control}>
              <Slider
                label={t('settings.voice.speed')}
                hideLabel
                value={settings.speed}
                min={VOICE_SPEED_MIN}
                max={VOICE_SPEED_MAX}
                step={VOICE_SPEED_STEP}
                valueText={`${settings.speed.toFixed(2)}×`}
                onChange={(speed) => handleChange({ ...settings, speed })}
              />
            </div>
          </SettingRow>
          <PickRow
            label={t('settings.voice.bargeIn')}
            description=""
            value={settings.bargeIn}
            options={bargeInChoices(t)}
            onPick={(level) =>
              handleChange({ ...settings, bargeIn: level as VoiceSettings['bargeIn'] })
            }
          />
          <PickRow
            label={t('settings.voice.permissionMode')}
            description=""
            value={settings.permissionMode}
            options={permissionChoices(t)}
            onPick={(mode) =>
              handleChange({ ...settings, permissionMode: mode as VoiceSettings['permissionMode'] })
            }
          />
          <PickRow
            label={t('settings.voice.provider')}
            description=""
            value={settings.provider}
            options={providerChoices(providers, t)}
            onPick={(provider) =>
              handleChange({ ...settings, provider: provider as VoiceSettings['provider'] })
            }
          />
          <PickRow
            label={t('settings.voice.region')}
            description=""
            value={settings.region}
            options={regionChoices(t)}
            onPick={(region) =>
              handleChange({ ...settings, region: region as VoiceSettings['region'] })
            }
          />
          <SettingRow label={t('settings.voice.stillHere')}>
            <Switch
              label={t('settings.voice.stillHere')}
              labelHidden
              checked={settings.stillHere}
              onChange={(stillHere) => handleChange({ ...settings, stillHere })}
            />
          </SettingRow>
        </div>
      </Card>
    </Section>
  )
}
