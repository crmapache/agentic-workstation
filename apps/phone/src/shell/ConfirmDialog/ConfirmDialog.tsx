import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

import styles from './ConfirmDialog.module.scss'

/**
 * «Точно?» перед тем, что не отменить (остановить прогон, убрать элемент очереди, забыть
 * аккаунт) или что легко задеть пальцем случайно (переставить элемент очереди). text - чем это
 * кончится, если по заголовку не ясно: человек решает, видя последствие, а не догадываясь о нём.
 * tone primary - для действия, которое ничего не уничтожает: красная кнопка там пугала бы зря.
 */
export const ConfirmDialog = ({
  open,
  title,
  text,
  confirmLabel,
  tone = 'danger',
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  text?: string | undefined
  confirmLabel: string
  tone?: 'danger' | 'primary' | undefined
  onConfirm: () => void
  onClose: () => void
}) => {
  const { t } = useTranslation()

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <Dialog
      open={open}
      title={title}
      onSubmit={handleConfirm}
      onClose={onClose}
      actions={
        <>
          <Button size="touch" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="touch" variant={tone} type="submit">
            {confirmLabel}
          </Button>
        </>
      }>
      {text ? <p className={styles.text}>{text}</p> : null}
    </Dialog>
  )
}
