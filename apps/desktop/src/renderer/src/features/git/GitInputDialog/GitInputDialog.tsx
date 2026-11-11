import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import { TextField } from '@agentic-workstation/ui/TextField'

import type { GitInputDialogProps } from './GitInputDialog.types'

/**
 * Диалог git с одним полем: имя новой ветки, тег или коммит. Пока git работает,
 * поле и кнопка заблокированы; отказ git остаётся под полем, успех закрывает диалог.
 */
export const GitInputDialog = ({
  open,
  title,
  label,
  placeholder,
  submitLabel,
  onSubmit,
  onClose,
}: GitInputDialogProps) => {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [isRunning, setIsRunning] = useState(false)

  const handleClose = () => {
    setValue('')
    setError(undefined)
    onClose()
  }

  const handleSubmit = async () => {
    if (value.trim() === '' || isRunning) return

    setIsRunning(true)

    const result = await onSubmit(value.trim())

    setIsRunning(false)
    if (result.ok) handleClose()
    else setError(result.details)
  }

  const actions = (
    <>
      <Button variant="ghost" onClick={handleClose}>
        {t('common.cancel')}
      </Button>
      <Button type="submit" variant="primary" disabled={value.trim() === '' || isRunning}>
        {submitLabel}
      </Button>
    </>
  )

  return (
    <Dialog
      open={open}
      title={title}
      actions={actions}
      onSubmit={handleSubmit}
      onClose={handleClose}>
      <TextField
        label={label}
        placeholder={placeholder}
        value={value}
        error={error}
        disabled={isRunning}
        onChange={setValue}
      />
    </Dialog>
  )
}
