import { Play, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import type { VoicePreviewButtonProps } from '../SettingsDialog.types'

/** Кнопка пробы голоса: «слушать», пока образец готовится - крутилка, пока звучит - «стоп». */
export const VoicePreviewButton = ({ phase, onToggle }: VoicePreviewButtonProps) => {
  const { t } = useTranslation()

  return (
    <IconButton
      icon={phase === 'playing' ? Square : Play}
      busy={phase === 'loading'}
      label={phase === null ? t('settings.voice.preview') : t('settings.voice.previewStop')}
      size="sm"
      onClick={onToggle}
    />
  )
}
