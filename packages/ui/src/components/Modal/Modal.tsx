import clsx from 'clsx'
import { X } from 'lucide-react'

import { useModalDialog } from '../Dialog/Dialog.hooks'
import { IconButton } from '../IconButton/IconButton'
import { IconPlaque } from '../IconPlaque/IconPlaque'
import { ownClose, useInitialFocus, useBackdropClose } from './Modal.hooks'
import styles from './Modal.module.scss'
import type { ModalProps } from './Modal.types'

/**
 * Окно с содержимым по центру поверх IDE: подробности предмета или форма нового. Шапка -
 * иконка, заголовок, строка под ним, свои элементы и крестик; тело прокручивается, подвал
 * прибит к низу. Нативный <dialog>: Esc и щелчок мимо закрывают. Один вопрос с ответом
 * (имя ветки, «удалить?») - Dialog; лист у края панели - Sheet.
 */
export const Modal = ({
  open,
  title,
  description,
  icon,
  iconTone,
  size = 'md',
  headerActions,
  footer,
  closeLabel,
  onClose,
  children,
}: ModalProps) => {
  const ref = useModalDialog(open)
  const backdrop = useBackdropClose(onClose)

  useInitialFocus(ref, open)

  return (
    <dialog
      ref={ref}
      aria-label={title}
      tabIndex={-1}
      className={clsx(styles.modal, styles[size])}
      onClose={ownClose(onClose)}
      {...backdrop}>
      <header className={styles.head}>
        {icon && <IconPlaque icon={icon} tone={iconTone} size="lg" />}
        <div className={styles.titles}>
          <h2 className={styles.title}>{title}</h2>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {headerActions && <div className={styles.headerActions}>{headerActions}</div>}
        <IconButton icon={X} size="sm" label={closeLabel} onClick={onClose} />
      </header>
      <div className={styles.body}>{children}</div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </dialog>
  )
}
