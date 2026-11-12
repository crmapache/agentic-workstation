import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

import styles from './ConfirmDialog.module.scss'

/**
 * «Точно?» перед тем, что не отменить: остановить прогон, убрать элемент очереди, забыть
 * аккаунт. text - чем это кончится, если по заголовку не ясно (вход уходит с Mac, процесс
 * гаснет): человек решает, видя последствие, а не догадываясь о нём.
 */
export const ConfirmDialog = ({
  open,
  title,
  text,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  text?: string | undefined
  confirmLabel: string
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
          <Button size="touch" variant="danger" type="submit">
            {confirmLabel}
          </Button>
        </>
      }>
      {text ? <p className={styles.text}>{text}</p> : null}
    </Dialog>
  )
}
