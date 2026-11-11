import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import { TextField } from '@agentic-workstation/ui/TextField'

/** Одно поле и «сохранить»: новое имя очереди. Открывается с текущим значением. */
export const TextDialog = ({
  open,
  title,
  label,
  initial,
  maxLength,
  onSave,
  onClose,
}: {
  open: boolean
  title: string
  label: string
  initial: string
  maxLength: number
  onSave: (value: string) => void
  onClose: () => void
}) => {
  const { t } = useTranslation()
  const [value, setValue] = useState(initial)

  const handleSave = () => {
    if (!value.trim()) return

    onSave(value.trim())
    onClose()
  }

  return (
    <Dialog
      open={open}
      title={title}
      onSubmit={handleSave}
      onClose={onClose}
      actions={
        <>
          <Button size="touch" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="touch" variant="primary" type="submit" disabled={!value.trim()}>
            {t('common.save')}
          </Button>
        </>
      }>
      <TextField
        label={label}
        value={value}
        maxLength={maxLength}
        data-autofocus
        onChange={setValue}
      />
    </Dialog>
  )
}
