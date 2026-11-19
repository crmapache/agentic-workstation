import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

import type { AskedDialogProps } from '../ExtensionDialog.types'
import { initialValue } from '../ExtensionDialog.utils'
import { invoke } from '../../../../lib/ipc'
import { useExtensionDialogs } from '../../../../state/extension-dialogs.store'
import { DialogBody } from './DialogBody'

/** Один вопрос расширения: ответ по кнопке или Enter, «без ответа» - по отмене и Esc. */
export const AskedDialog = ({ request }: AskedDialogProps) => {
  const { t } = useTranslation()
  const remove = useExtensionDialogs((store) => store.remove)
  const [value, setValue] = useState(() => initialValue(request.dialog))
  const { dialog } = request

  const answer = (reply: string | boolean | null) => {
    remove(request.requestId)
    void invoke('extensions:answerDialog', { requestId: request.requestId, answer: reply })
  }

  const handleSubmit = () => answer(dialog.kind === 'confirm' ? true : value)

  const handleClose = () => answer(dialog.kind === 'confirm' ? false : null)

  return (
    <Dialog
      open
      title={dialog.title}
      actions={
        <>
          <Button variant="ghost" onClick={handleClose}>
            {t('extensions.dialog.cancel')}
          </Button>
          <Button
            variant={dialog.kind === 'confirm' && dialog.danger ? 'danger' : 'primary'}
            type="submit">
            {dialog.kind === 'confirm' ? dialog.confirmLabel : t('extensions.dialog.ok')}
          </Button>
        </>
      }
      onSubmit={handleSubmit}
      onClose={handleClose}>
      <DialogBody request={request} value={value} onValue={setValue} />
    </Dialog>
  )
}
