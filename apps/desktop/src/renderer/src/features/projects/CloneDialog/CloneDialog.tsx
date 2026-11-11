import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import { TextField } from '@agentic-workstation/ui/TextField'

import { displayPath } from '../../../lib/path.utils'
import { useAppInfo } from '../../../state/app-info.queries'
import { useCloneForm } from './CloneDialog.hooks'
import styles from './CloneDialog.module.scss'
import type { CloneDialogProps } from './CloneDialog.types'

/**
 * Клонирование репозитория: адрес и папка, куда положить. Клон появляется в новой
 * папке с именем репозитория и сразу открывается вкладкой. Ошибку git - нет доступа,
 * папка занята - показывает под адресом.
 */
export const CloneDialog = ({ open, onClose }: CloneDialogProps) => {
  const { t } = useTranslation()
  const { data: appInfo } = useAppInfo()
  const form = useCloneForm(onClose)

  const handleClose = () => {
    form.reset()
    onClose()
  }

  const actions = (
    <>
      <Button variant="ghost" onClick={handleClose}>
        {t('common.cancel')}
      </Button>
      <Button type="submit" variant="primary" disabled={form.url.trim() === '' || form.isCloning}>
        {form.isCloning ? t('clone.cloning') : t('clone.clone')}
      </Button>
    </>
  )

  return (
    <Dialog
      open={open}
      title={t('clone.title')}
      actions={actions}
      onSubmit={form.submit}
      onClose={handleClose}>
      <TextField
        label={t('clone.url')}
        placeholder={t('clone.urlPlaceholder')}
        value={form.url}
        error={form.error}
        disabled={form.isCloning}
        onChange={form.setUrl}
      />
      <div className={styles.folder}>
        <TextField
          label={t('clone.folder')}
          value={displayPath(form.folder, appInfo?.homeDir)}
          readOnly
          onChange={() => undefined}
        />
        <Button disabled={form.isCloning} onClick={form.browse}>
          {t('clone.browse')}
        </Button>
      </div>
    </Dialog>
  )
}
