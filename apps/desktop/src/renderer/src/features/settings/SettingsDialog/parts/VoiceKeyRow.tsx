import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { VoiceKeyCheck, VoiceKeyRefusal } from '@shared/voice'

import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../SettingsDialog.module.scss'
import { useVoice, checkVoiceKey, useSetVoiceKey } from '../../../../state/voice.queries'
import { SettingRow } from './SettingRow'

/**
 * Ключ Deepgram (Settings → Voice): вставить и сохранить, проверить (введённый или сохранённый),
 * забыть. Сохранённый ключ окну не возвращается - видны только последние четыре знака.
 */
export const VoiceKeyRow = () => {
  const { t } = useTranslation()
  const key = useVoice()?.key
  const saveKey = useSetVoiceKey()
  const [draft, setDraft] = useState('')
  const [check, setCheck] = useState<VoiceKeyCheck | null>(null)
  const [refusal, setRefusal] = useState<VoiceKeyRefusal | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const description = key?.saved
    ? t('settings.voice.keySaved', { hint: key.hint ?? '' })
    : t('settings.voice.keyNone')

  const handleSave = async () => {
    const outcome = await saveKey(draft)

    setCheck(null)
    setRefusal(outcome.ok ? null : outcome.reason)
    if (outcome.ok) setDraft('')
  }

  const handleForget = async () => {
    const outcome = await saveKey(null)

    setCheck(null)
    setRefusal(outcome.ok ? null : outcome.reason)
  }

  const handleCheck = async () => {
    setIsChecking(true)
    setCheck(await checkVoiceKey(draft.trim() || null))
    setIsChecking(false)
  }

  return (
    <SettingRow label={t('settings.voice.key')} description={description} wide>
      <div className={styles.keyRow}>
        <div className={styles.keyField}>
          <TextField
            label={t('settings.voice.key')}
            hideLabel
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={t('settings.voice.keyPlaceholder')}
            value={draft}
            onChange={setDraft}
          />
        </div>
        <div className={styles.keyButtons}>
          <Button disabled={!draft.trim()} onClick={() => void handleSave()}>
            {t('settings.voice.keySave')}
          </Button>
          <Button
            variant="secondary"
            disabled={isChecking || (!draft.trim() && !key?.saved)}
            onClick={() => void handleCheck()}>
            {t('settings.voice.keyCheck')}
          </Button>
          {key?.saved && (
            <Button variant="ghost" onClick={() => void handleForget()}>
              {t('settings.voice.keyForget')}
            </Button>
          )}
        </div>
        {refusal && (
          <span className={styles.keyBad}>{t(`settings.voice.keyRefused_${refusal}`)}</span>
        )}
        {check && (
          <span className={check === 'ok' ? styles.keyOk : styles.keyBad}>
            {t(`settings.voice.keyCheck_${check}`)}
          </span>
        )}
      </div>
    </SettingRow>
  )
}
