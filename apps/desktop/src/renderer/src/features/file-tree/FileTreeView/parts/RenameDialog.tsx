import { useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import type { FileOpCode } from '@shared/file-ops'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../FileTreeView.module.scss'
import type { RenameDialogProps } from '../FileTreeView.types'
import { stemLength, renamedPath } from '../FileTreeView.utils'
import { useFileActions } from '../../file-tree.queries'
import { splitPath, isBadFileName } from '../../../../lib/path.utils'
import { ReferencesSwitch } from './ReferencesSwitch'

/**
 * Переименование, как Rename в WebStorm: имя без расширения выделено, под полем - сколько
 * импортов и ссылок на файл или папку найдено, и переписать ли их вместе с именем (по умолчанию
 * да). Имя с «/» - уже перенос, его делает вырезать и вставить.
 */
export const RenameDialog = ({ project, item, onClose }: RenameDialogProps) => {
  const { t } = useTranslation()
  const { move: moveAction } = useFileActions(project)
  const initial = splitPath(item.path).name
  const [name, setName] = useState(initial)
  const [update, setUpdate] = useState(true)
  const [error, setError] = useState<FileOpCode | null>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  const trimmed = name.trim()
  const valid = trimmed !== '' && !isBadFileName(trimmed) && trimmed !== initial
  const move = valid ? { from: item.path, to: renamedPath(item.path, trimmed) } : null

  // Выделено имя без расширения: новое имя набирают поверх, расширение остаётся.
  useEffect(() => {
    fieldRef.current?.setSelectionRange(0, stemLength(initial, item.isDirectory))
  }, [initial, item.isDirectory])

  const handleChange = (value: string) => {
    setName(value)
    setError(null)
  }

  const handleSubmit = () => {
    if (trimmed === initial) return onClose()
    if (!move || moveAction.isPending)
      return setError(isBadFileName(trimmed) ? 'invalidName' : null)

    moveAction.mutate(
      { move, update },
      { onSuccess: (outcome) => (outcome.ok ? onClose() : setError(outcome.code)) },
    )
  }

  return (
    <Dialog
      open
      title={t('fileTree.rename.title')}
      onSubmit={handleSubmit}
      onClose={onClose}
      actions={
        <>
          <Button type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={moveAction.isPending || !trimmed}>
            {t('fileTree.rename.submit')}
          </Button>
        </>
      }>
      <div className={styles.dialogBody}>
        <TextField
          ref={fieldRef}
          label={t('fileTree.rename.nameLabel')}
          value={name}
          error={error ? t(`fileTree.errors.${error}`) : undefined}
          spellCheck={false}
          onChange={handleChange}
        />
        <ReferencesSwitch
          projectId={project.id}
          move={move}
          checked={update}
          onChange={setUpdate}
        />
      </div>
    </Dialog>
  )
}
