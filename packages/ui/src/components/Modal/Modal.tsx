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
 * прибит к низу. Нативный <dialog>: Esc и щелчок мимо закрывают; IDE под ним темнеет, а у
 * настройки, которую смотрят на самой IDE, - нет (backdrop clear). С разделами - колонка меню
 * слева (aside) и высота окна на всё место (tall). Один вопрос с ответом
 * (имя ветки, «удалить?») - Dialog; лист у края панели - Sheet.
 */
export const Modal = ({
  open,
  title,
  description,
  icon,
  iconTone,
  size = 'md',
  backdrop: backdropLook = 'dim',
  tall = false,
  aside,
  headerActions,
  footer,
  closeLabel,
  closeSize = 'sm',
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
      className={clsx(
        styles.modal,
        styles[size],
        backdropLook === 'clear' && styles.clear,
        tall && styles.tall,
      )}
      onClose={ownClose(onClose)}
      {...backdrop}>
      <header className={styles.head}>
        {icon && <IconPlaque icon={icon} tone={iconTone} size="lg" />}
        <div className={styles.titles}>
          <h2 className={styles.title}>{title}</h2>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {headerActions && <div className={styles.headerActions}>{headerActions}</div>}
        <IconButton icon={X} size={closeSize} label={closeLabel} onClick={onClose} />
      </header>
      {aside ? (
        <div className={styles.columns}>
          <div className={styles.aside}>{aside}</div>
          <div className={styles.body}>{children}</div>
        </div>
      ) : (
        <div className={styles.body}>{children}</div>
      )}
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </dialog>
  )
}
