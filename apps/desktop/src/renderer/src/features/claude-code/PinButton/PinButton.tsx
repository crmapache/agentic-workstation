import { Pin } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { usePin } from '../pins.store'
import type { PinButtonProps } from './PinButton.types'

/**
 * Горящая булавка в углу карточки, как в ACC: видна, только пока сообщение закреплено, -
 * её видно и с экрана, где полки нет, а нажатие открепляет. Закрепить - пункт меню карточки
 * (PinItem).
 */
export const PinButton = ({ conversationId, itemId }: PinButtonProps) => {
  const { t } = useTranslation()
  const pin = usePin(conversationId, itemId)

  if (!pin.isPinned) return null

  return (
    <IconButton
      icon={Pin}
      size="sm"
      label={t('claudeCode.pins.remove')}
      active
      onClick={pin.toggle}
    />
  )
}
