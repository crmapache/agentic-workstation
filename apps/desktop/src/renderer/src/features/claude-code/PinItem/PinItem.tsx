import { Pin, PinOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { MenuItem } from '@agentic-workstation/ui/MenuItem'

import { usePin } from '../pins.store'
import type { PinItemProps } from './PinItem.types'

/**
 * Пункт меню карточки «закрепить / открепить». Полная полка гасит пункт, но не прячет:
 * вторая строка говорит, что сначала надо открепить другое, - до нажатия, а не после.
 */
export const PinItem = ({ conversationId, itemId }: PinItemProps) => {
  const { t } = useTranslation()
  const pin = usePin(conversationId, itemId)

  return (
    <MenuItem
      icon={pin.isPinned ? PinOff : Pin}
      label={pin.isPinned ? t('claudeCode.pins.remove') : t('claudeCode.pins.add')}
      description={pin.isCrowded ? t('claudeCode.pins.crowded') : undefined}
      wrapDescription
      disabled={pin.isCrowded}
      onSelect={pin.toggle}
    />
  )
}
