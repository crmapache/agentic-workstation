import { useState } from 'react'
import { Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Section } from '@agentic-workstation/ui/Section'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useExtensionsStore } from '../extensions.store'
import { useStoreActions } from '../store.actions'
import { useStoreIdentity } from '../store.queries'
import { storeErrorText } from '../store.utils'
import { GrantList } from '../GrantList/GrantList'
import styles from './PublishModal.module.scss'
import type { PublishModalProps } from './PublishModal.types'

/**
 * Публикация своего расширения в магазин (ADR 0091): имя автора, что расширение просит, версия.
 * Личность - ключ этой IDE в связке ключей; следующая версия публикуется тем же окном.
 */
export const PublishModal = ({ extension }: PublishModalProps) => {
  const { t } = useTranslation()
  const close = useExtensionsStore((store) => store.close)
  const actions = useStoreActions()
  const { data: identity } = useStoreIdentity(true)
  const [name, setName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const { manifest } = extension
  const shownName = name ?? (identity?.ok ? identity.value.name : '')

  if (!manifest) return null

  const handlePublish = async () => {
    setBusy(true)

    if (name !== null && identity?.ok && name.trim() !== identity.value.name) {
      const renamed = await actions.rename(name.trim())

      if (!renamed.ok) {
        setBusy(false)

        return setNote({ ok: false, text: storeErrorText(t, renamed) })
      }
    }

    const result = await actions.publish(extension.id)

    setBusy(false)
    setNote(
      result.ok
        ? { ok: true, text: t('extensions.store.publish.done', { version: result.value.version }) }
        : { ok: false, text: storeErrorText(t, result) },
    )
  }

  return (
    <Modal
      open
      icon={Upload}
      iconTone="accent"
      title={t('extensions.store.publish.title', { name: manifest.name })}
      closeLabel={t('extensions.modal.close')}
      onClose={close}
      footer={
        <div className={styles.actions}>
          <Button variant="ghost" size="sm" onClick={close}>
            {t('extensions.store.publish.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Upload}
            disabled={busy || note?.ok === true}
            onClick={() => void handlePublish()}>
            {t('extensions.store.publish.submit', { version: manifest.version })}
          </Button>
        </div>
      }>
      <div className={styles.form}>
        <TextField
          label={t('extensions.store.publish.author')}
          value={shownName}
          onChange={setName}
        />
        <p className={styles.hint}>{t('extensions.store.publish.authorHint')}</p>
        {manifest.requests.permissions.length > 0 && (
          <Section size="sm" title={t('extensions.store.listing.permissions')}>
            <GrantList grant={manifest.requests} />
          </Section>
        )}
        <p className={styles.hint}>{t('extensions.store.publish.hint')}</p>
        {identity && !identity.ok && (
          <p className={styles.failure}>{storeErrorText(t, identity)}</p>
        )}
        {note && <p className={note.ok ? styles.note : styles.failure}>{note.text}</p>}
      </div>
    </Modal>
  )
}
