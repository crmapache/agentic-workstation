import type { FormEvent } from 'react'
import clsx from 'clsx'

import { ownClose } from '../Modal/Modal.hooks'
import { useModalDialog } from './Dialog.hooks'
import styles from './Dialog.module.scss'
import type { DialogProps } from './Dialog.types'

/**
 * Модальный диалог с одним вопросом: имя новой ветки, адрес репозитория,
 * подтверждение. Нативный <dialog>: Esc и «Отмена» закрывают, Enter подтверждает.
 * Настройка, которую видно в окне (размер текста), - с backdrop="clear".
 */
export const Dialog = ({
  open,
  title,
  backdrop = 'dim',
  children,
  actions,
  onSubmit,
  onClose,
}: DialogProps) => {
  const ref = useModalDialog(open)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={clsx(styles.dialog, backdrop === 'clear' && styles.clear)}
      onClose={ownClose(onClose)}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.title}>{title}</div>
        <div className={styles.body}>{children}</div>
        <div className={styles.actions}>{actions}</div>
      </form>
    </dialog>
  )
}
