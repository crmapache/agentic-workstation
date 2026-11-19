import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PRESET_NAME_MAX } from '@shared/panel-prefs'

import { TextField } from '@agentic-workstation/ui/TextField'

import type { PresetPartProps } from '../PresetScreen.types'

/**
 * Имя пресета - подпись его кнопки под полем. Пишется на каждой букве, пока оно не пустое:
 * пустое не сохраняется (кнопка без подписи), и уход из пустого поля возвращает сохранённое.
 */
export const PresetName = ({ preset, onChange }: PresetPartProps) => {
  const { t } = useTranslation()
  const [typed, setTyped] = useState(preset.name)
  const isEmpty = typed.trim() === ''

  const handleChange = (value: string) => {
    setTyped(value)

    if (value.trim() && value.trim() !== preset.name) onChange({ name: value.trim() })
  }

  return (
    <TextField
      label={t('agentPanel.presets.name')}
      value={typed}
      maxLength={PRESET_NAME_MAX}
      spellCheck={false}
      error={isEmpty ? t('agentPanel.presets.nameEmpty') : undefined}
      onChange={handleChange}
      onBlur={() => setTyped(typed.trim() || preset.name)}
    />
  )
}
