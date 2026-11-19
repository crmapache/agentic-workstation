import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

import type { RemoveDialogProps } from '../ConnectionsScreen.types'

/** Убрать подключение: его модели уходят из меню, ключ стирается с этого компьютера. */
export const RemoveConnectionDialog = ({ connection, onConfirm, onClose }: RemoveDialogProps) => {
  const { t } = useTranslation()

  return (
    <Dialog
      open={connection !== null}
      title={t('openModels.connections.removeTitle', { name: connection?.label ?? '' })}
      onSubmit={onConfirm}
      onClose={onClose}
      actions={
        <>
          <Button type="button" onClick={onClose}>
            {t('openModels.connections.dialog.cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {t('openModels.connections.remove')}
          </Button>
        </>
      }>
      {t('openModels.connections.removeText')}
    </Dialog>
  )
}
