import { Square, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useReadAloud } from './ReadAloudButton.hooks'
import type { ReadAloudButtonProps } from './ReadAloudButton.types'

/**
 * Идущее чтение вслух в углу ответа модели (ADR 0106), как горящая булавка: видна, только пока
 * этот ответ читается, - пока звук готовится, крутилка, пока звучит, «стоп». Начать чтение -
 * пункт меню карточки (ReadAloudItem).
 */
export const ReadAloudButton = ({ itemId, text }: ReadAloudButtonProps) => {
  const { t } = useTranslation()
  const { phase, handleToggle } = useReadAloud(itemId, text)

  if (phase === null) return null

  return (
    <IconButton
      icon={phase === 'playing' ? Square : Volume2}
      busy={phase === 'loading'}
      label={t('voice.read.stop')}
      size="sm"
      onClick={handleToggle}
    />
  )
}
