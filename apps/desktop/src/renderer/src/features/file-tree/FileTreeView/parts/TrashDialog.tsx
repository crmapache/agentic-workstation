import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'

import styles from '../FileTreeView.module.scss'
import type { TrashDialogProps } from '../FileTreeView.types'
import { useFileActions } from '../../file-tree.queries'
import { splitPath } from '../../../../lib/path.utils'
import { IS_MAC } from '../../../../lib/platform'

/** «Move to Trash?» - в корзину системы, а не насовсем: вернуть можно из Finder. */
export const TrashDialog = ({ project, item, onClose }: TrashDialogProps) => {
  const { t } = useTranslation()
  const { trash } = useFileActions(project)

  const handleSubmit = () => {
    onClose()
    trash.mutate(item.path)
  }

  return (
    <Dialog
      open
      title={t(IS_MAC ? 'fileTree.trash.title' : 'fileTree.trash.titleWindows')}
      onSubmit={handleSubmit}
      onClose={onClose}
      actions={
        <>
          <Button type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="danger">
            {t(IS_MAC ? 'fileTree.trash.submit' : 'fileTree.trash.submitWindows')}
          </Button>
        </>
      }>
      <div className={styles.dialogBody}>
        <div className={styles.dialogSubject}>{splitPath(item.path).name}</div>
        <p className={styles.dialogNote}>
          {t(
            item.isDirectory
              ? IS_MAC
                ? 'fileTree.trash.folderNote'
                : 'fileTree.trash.folderNoteWindows'
              : IS_MAC
                ? 'fileTree.trash.fileNote'
                : 'fileTree.trash.fileNoteWindows',
          )}
        </p>
      </div>
    </Dialog>
  )
}
