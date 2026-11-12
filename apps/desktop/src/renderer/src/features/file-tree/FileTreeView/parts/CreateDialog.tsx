import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { FileOpCode } from '@shared/file-ops'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import { TextField } from '@agentic-workstation/ui/TextField'

import type { CreateDialogProps } from '../FileTreeView.types'
import { useFileActions } from '../../file-tree.queries'

/**
 * Новый файл или папка, как в WebStorm: одно поле имени, «/» в имени - подпапки по дороге
 * («ui/Button.tsx»). Отказ (имя занято, не годится) - под полем, окно остаётся.
 */
export const CreateDialog = ({ project, parent, entry, onClose }: CreateDialogProps) => {
  const { t } = useTranslation()
  const { create } = useFileActions(project)
  const [name, setName] = useState('')
  const [error, setError] = useState<FileOpCode | null>(null)
  const isFile = entry === 'file'

  const handleChange = (value: string) => {
    setName(value)
    setError(null)
  }

  const handleSubmit = () => {
    if (!name.trim() || create.isPending) return

    create.mutate(
      { parent, name, kind: entry },
      { onSuccess: (outcome) => (outcome.ok ? onClose() : setError(outcome.code)) },
    )
  }

  return (
    <Dialog
      open
      title={t(isFile ? 'fileTree.create.fileTitle' : 'fileTree.create.folderTitle')}
      onSubmit={handleSubmit}
      onClose={onClose}
      actions={
        <>
          <Button type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>
            {t('fileTree.create.submit')}
          </Button>
        </>
      }>
      <TextField
        label={t('fileTree.create.nameLabel')}
        value={name}
        placeholder={isFile ? t('fileTree.create.fileHint') : undefined}
        error={error ? t(`fileTree.errors.${error}`) : undefined}
        spellCheck={false}
        onChange={handleChange}
      />
    </Dialog>
  )
}
