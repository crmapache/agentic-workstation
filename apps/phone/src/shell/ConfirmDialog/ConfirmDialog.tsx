import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

/** «Точно?» перед тем, что не отменить: остановить прогон, убрать элемент очереди. */
export const ConfirmDialog = ({
  open,
  title,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
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
      {null}
    </Dialog>
  )
}
