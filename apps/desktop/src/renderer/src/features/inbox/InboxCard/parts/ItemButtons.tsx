import { useTranslation } from 'react-i18next'

import type { InboxAction } from '@shared/inbox'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../InboxCard.module.scss'
import type { ItemButtonsProps } from '../InboxCard.types'
import { useInboxActions } from '../../inbox.actions'

/**
 * Кнопки уведомления в ряд: главная - тонированная, «закрыть» - тихая. Подпись - от ИИ, а у
 * кнопок IDE (разрешить, показать прогон) - словами окна по их виду.
 */
export const ItemButtons = ({ item, text, actions, size = 'sm' }: ItemButtonsProps) => {
  const { t } = useTranslation()
  const inbox = useInboxActions()

  const variantOf = (action: InboxAction) =>
    action.primary ? 'primary' : action.kind === 'dismiss' ? 'ghost' : 'secondary'

  if (actions.length === 0) return null

  return (
    <div className={styles.buttons}>
      {actions.map((action) => (
        <Button
          key={action.id}
          size={size}
          variant={variantOf(action)}
          onClick={() => void inbox.act(item, action, text)}>
          {action.label || t(`inbox.actions.${action.kind}`)}
        </Button>
      ))}
    </div>
  )
}
