import { Square, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useReadAloud } from './ReadAloudButton.hooks'
import type { ReadAloudButtonProps } from './ReadAloudButton.types'

/**
 * «Прочитать вслух» в углу ответа модели (ADR 0106): пока звук готовится - крутилка, пока
 * звучит - «стоп». Голосом и скоростью из Settings → Voice, голос - по языку ответа. Ставит её
 * ответ, когда useReadAloudAvailable: голос выключен или нет ключа - кнопки нет.
 */
export const ReadAloudButton = ({ itemId, text }: ReadAloudButtonProps) => {
  const { t } = useTranslation()
  const { phase, handleToggle } = useReadAloud(itemId, text)

  return (
    <IconButton
      icon={phase === 'playing' ? Square : Volume2}
      busy={phase === 'loading'}
      label={phase === null ? t('voice.read.start') : t('voice.read.stop')}
      size="sm"
      onClick={handleToggle}
    />
  )
}
