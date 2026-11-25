import { Square, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { useReadAloud } from '../ReadAloudButton/ReadAloudButton.hooks'
import type { ReadAloudItemProps } from './ReadAloudItem.types'

/**
 * Пункт меню ответа «прочитать вслух / остановить» (ADR 0106): голосом и скоростью из
 * Settings → Voice, голос - по языку ответа. Ставит его ответ, когда useReadAloudAvailable:
 * голос выключен или нет ключа - пункта нет. Идущее чтение видно и в углу (ReadAloudButton).
 */
export const ReadAloudItem = ({ itemId, text }: ReadAloudItemProps) => {
  const { t } = useTranslation()
  const { phase, handleToggle } = useReadAloud(itemId, text)

  return (
    <MenuItem
      icon={phase === 'playing' ? Square : Volume2}
      label={phase === null ? t('voice.read.start') : t('voice.read.stop')}
      onSelect={handleToggle}
    />
  )
}
