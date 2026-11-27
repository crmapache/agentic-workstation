import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  PASTE_COLLAPSE_MAX,
  PASTE_COLLAPSE_MIN,
  DEFAULT_PASTE_COLLAPSE,
  PASTE_ALWAYS_FOLDS_CHARS,
} from '@shared/ide-prefs'

import { Card } from '@agentic-workstation/ui/Card'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Section } from '@agentic-workstation/ui/Section'
import { Switch } from '@agentic-workstation/ui/Switch'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../SettingsDialog.module.scss'
import { clampPasteCollapse } from '../SettingsDialog.utils'
import { useIdePrefs, useSetIdePrefs } from '../../../../state/ide-prefs.queries'
import { ReturnCard } from './ReturnCard'
import { SettingRow } from './SettingRow'

/**
 * Раздел «Chat»: чаты всех провайдеров разом. Вставка - с какого числа строк она сворачивается
 * в чип (как в ACC); выключено - со своим исключением на виду: огромная вставка сворачивается
 * всё равно. Число набирается, а не выбирается из лесенки; выключенное поле остаётся видно - по
 * нему понятно, к чему вернётся сворачивание. Вторая карточка - возврат к чату после Computer Use.
 */
export const ChatPane = () => {
  const { t } = useTranslation()
  const { pasteCollapse } = useIdePrefs()
  const save = useSetIdePrefs()
  const [draft, setDraft] = useState<string | null>(null)
  const isOn = pasteCollapse > 0
  const fallback = pasteCollapse || DEFAULT_PASTE_COLLAPSE
  const thousands = Math.round(PASTE_ALWAYS_FOLDS_CHARS / 1000)

  // Цифры без поправки на лету: «5», прыгнувшее в «500» на второй цифре, мешало бы набору.
  const handleTyped = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 3)
    const lines = Number.parseInt(digits, 10)

    setDraft(digits)

    if (lines >= PASTE_COLLAPSE_MIN && lines <= PASTE_COLLAPSE_MAX) {
      void save({ pasteCollapse: lines })
    }
  }

  const handleBlur = () => {
    if (draft !== null) void save({ pasteCollapse: clampPasteCollapse(draft, fallback) })

    setDraft(null)
  }

  const handleToggle = (on: boolean) =>
    void save({ pasteCollapse: on ? clampPasteCollapse(draft ?? '', fallback) : 0 })

  return (
    <Section title={t('settings.sections.chat')} description={t('settings.chat.description')}>
      <Card
        title={t('settings.chat.pasteTitle')}
        help={
          <HelpButton
            label={t('settings.chat.helpLabel')}
            title={t('settings.chat.fold')}
            text={t('settings.chat.help')}
            closeLabel={t('common.close')}
          />
        }>
        <div className={styles.rows}>
          <SettingRow
            label={t('settings.chat.fold')}
            description={
              isOn ? t('settings.chat.foldOn') : t('settings.chat.foldOff', { thousands })
            }>
            <Switch
              label={t('settings.chat.fold')}
              labelHidden
              checked={isOn}
              onChange={handleToggle}
            />
          </SettingRow>
          <SettingRow
            label={t('settings.chat.lines')}
            description={t('settings.chat.linesHint', {
              min: PASTE_COLLAPSE_MIN,
              max: PASTE_COLLAPSE_MAX,
            })}
            dimmed={!isOn}>
            <div className={styles.control}>
              <TextField
                label={t('settings.chat.lines')}
                hideLabel
                inputMode="numeric"
                spellCheck={false}
                disabled={!isOn}
                value={draft ?? String(fallback)}
                onChange={handleTyped}
                onBlur={handleBlur}
              />
            </div>
          </SettingRow>
        </div>
      </Card>
      <ReturnCard />
    </Section>
  )
}
