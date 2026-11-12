import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { FileOpCode } from '@shared/file-ops'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

import styles from '../FileTreeView.module.scss'
import type { MoveDialogProps } from '../FileTreeView.types'
import { useFileActions } from '../../file-tree.queries'
import { useFileTreeStore } from '../../file-tree.store'
import { splitPath } from '../../../../lib/path.utils'
import { ReferencesSwitch } from './ReferencesSwitch'

/**
 * Вставка вырезанного - перенос, как Move в WebStorm: куда, и переписать ли импорты и ссылки -
 * и на сам файл, и его собственные пути, ведь он теперь лежит в другой папке.
 */
export const MoveDialog = ({ project, move, onClose }: MoveDialogProps) => {
  const { t } = useTranslation()
  const { move: moveAction } = useFileActions(project)
  const setClipboard = useFileTreeStore((state) => state.setClipboard)
  const [update, setUpdate] = useState(true)
  const [error, setError] = useState<FileOpCode | null>(null)

  const handleSubmit = () => {
    if (moveAction.isPending) return

    moveAction.mutate(
      { move, update },
      {
        onSuccess: (outcome) => {
          if (!outcome.ok) return setError(outcome.code)

          setClipboard(null)
          onClose()
        },
      },
    )
  }

  return (
    <Dialog
      open
      title={t('fileTree.move.title', { name: splitPath(move.from).name })}
      onSubmit={handleSubmit}
      onClose={onClose}
      actions={
        <>
          <Button type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={moveAction.isPending}>
            {t('fileTree.move.submit')}
          </Button>
        </>
      }>
      <div className={styles.dialogBody}>
        <p className={styles.dialogNote}>
          {t('fileTree.move.into', { folder: splitPath(move.to).folder || '/' })}
        </p>
        <ReferencesSwitch
          projectId={project.id}
          move={move}
          checked={update}
          onChange={setUpdate}
        />
        {error && <p className={styles.dialogError}>{t(`fileTree.errors.${error}`)}</p>}
      </div>
    </Dialog>
  )
}
