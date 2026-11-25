import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import type { ItemButtonProps } from '../InboxCard.types'
import { useInboxActions } from '../../inbox.actions'

/**
 * Одна кнопка уведомления: главная - тонированная, «закрыть» - тихая. Подпись - от ИИ, а у
 * кнопок IDE (разрешить, показать прогон) - словами окна по их виду. Ряд кнопок карточки -
 * ItemButtons, а в углу окна кнопки встают прямо в ряд карточки Toast.
 */
export const ItemButton = ({ item, action, text, size = 'sm' }: ItemButtonProps) => {
  const { t } = useTranslation()
  const inbox = useInboxActions()
  const variant = action.primary ? 'primary' : action.kind === 'dismiss' ? 'ghost' : 'secondary'

  const handlePress = () => void inbox.act(item, action, text)

  return (
    <Button size={size} variant={variant} onClick={handlePress}>
      {action.label || t(`inbox.actions.${action.kind}`)}
    </Button>
  )
}
