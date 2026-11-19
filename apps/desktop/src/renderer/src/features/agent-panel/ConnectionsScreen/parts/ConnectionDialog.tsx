import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Dialog } from '@agentic-workstation/ui/Dialog'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../ConnectionsScreen.module.scss'
import type { ConnectionDialogProps } from '../ConnectionsScreen.types'
import { sameHost } from '../ConnectionsScreen.utils'

/**
 * Новое подключение или правка своего: имя, адрес (у OpenRouter он известен и не спрашивается)
 * и ключ. Ключ окну назад не приходит: пустое поле у правки сохранённый ключ не трогает, убрать
 * его - отдельной кнопкой. Без шифрования IDE ключ не сохраняется вовсе.
 */
export const ConnectionDialog = ({
  draft,
  canStoreKeys,
  failed,
  onSave,
  onClose,
}: ConnectionDialogProps) => {
  const { t } = useTranslation()
  const [label, setLabel] = useState(draft?.label ?? '')
  const [baseUrl, setBaseUrl] = useState(draft?.baseUrl ?? '')
  const [key, setKey] = useState('')
  const isNew = draft?.id === null
  const asksUrl = draft?.kind !== 'openrouter'
  // Сменили хост - сохранённый ключ к нему не поедет: главный процесс его сотрёт.
  const keyStays = draft?.hasKey === true && sameHost(baseUrl, draft.baseUrl)

  const handleSubmit = () => {
    // Пустое поле ключа - не трогать сохранённый.
    if (draft) onSave({ ...draft, label, baseUrl }, key || undefined)
  }

  const handleRemoveKey = () => {
    if (draft) onSave({ ...draft, label, baseUrl }, null)
  }

  return (
    <Dialog
      open={draft !== null}
      title={
        isNew
          ? t('openModels.connections.dialog.addTitle')
          : t('openModels.connections.dialog.editTitle', { name: draft?.label ?? '' })
      }
      onSubmit={handleSubmit}
      onClose={onClose}
      actions={
        <>
          {!isNew && draft?.hasKey && (
            <Button type="button" variant="ghost" onClick={handleRemoveKey}>
              {t('openModels.connections.dialog.removeKey')}
            </Button>
          )}
          <Button type="button" onClick={onClose}>
            {t('openModels.connections.dialog.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={asksUrl && !baseUrl.trim()}>
            {isNew
              ? t('openModels.connections.dialog.add')
              : t('openModels.connections.dialog.save')}
          </Button>
        </>
      }>
      <TextField
        label={t('openModels.connections.dialog.label')}
        value={label}
        autoFocus
        onChange={setLabel}
      />
      {asksUrl && (
        <TextField
          label={t('openModels.connections.dialog.baseUrl')}
          value={baseUrl}
          placeholder={t('openModels.connections.dialog.baseUrlHint')}
          spellCheck={false}
          onChange={setBaseUrl}
        />
      )}
      {canStoreKeys && (
        <TextField
          label={t('openModels.connections.dialog.key')}
          type="password"
          value={key}
          placeholder={
            keyStays
              ? t('openModels.connections.dialog.keyKept')
              : draft?.hasKey
                ? t('openModels.connections.dialog.keyMoved')
                : undefined
          }
          autoComplete="off"
          spellCheck={false}
          onChange={setKey}
        />
      )}
      {failed && (
        <div role="alert" className={styles.failed}>
          {t('openModels.connections.dialog.failed')}
        </div>
      )}
    </Dialog>
  )
}
