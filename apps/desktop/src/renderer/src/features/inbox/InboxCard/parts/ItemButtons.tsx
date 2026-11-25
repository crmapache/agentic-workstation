import styles from '../InboxCard.module.scss'
import type { ItemButtonsProps } from '../InboxCard.types'
import { ItemButton } from './ItemButton'

/** Кнопки уведомления в ряд под сутью карточки; переносятся, если не влезли. */
export const ItemButtons = ({ item, text, actions, size = 'sm' }: ItemButtonsProps) => {
  if (actions.length === 0) return null

  return (
    <div className={styles.buttons}>
      {actions.map((action) => (
        <ItemButton key={action.id} item={item} action={action} text={text} size={size} />
      ))}
    </div>
  )
}
