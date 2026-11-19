import { useState } from 'react'
import { Store, Trash2, Upload, RotateCw, Sparkles, FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../ExtensionModal.module.scss'
import type { ExtensionPartProps } from '../ExtensionModal.types'
import { useExtensionActions } from '../../extensions.actions'
import { useExtensionsStore } from '../../extensions.store'

/**
 * Подвал окна расширения: поправить с ИИ, перезапустить, открыть папку; справа - убрать, с
 * вопросом: папка уходит в корзину, данные и секреты - насовсем.
 */
export const ExtensionFooter = ({ extension }: ExtensionPartProps) => {
  const { t } = useTranslation()
  const actions = useExtensionActions()
  const open = useExtensionsStore((store) => store.open)
  const close = useExtensionsStore((store) => store.close)
  const error = useExtensionsStore((store) => store.error)
  const [asking, setAsking] = useState(false)

  const handleRemove = async () => {
    if (await actions.remove(extension.id)) close()
  }

  return (
    <div className={styles.footer}>
      <Button size="sm" icon={Sparkles} onClick={() => open({ kind: 'edit', id: extension.id })}>
        {t('extensions.modal.editWithAi')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        icon={RotateCw}
        onClick={() => void actions.reload(extension.id)}>
        {t('extensions.modal.reload')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        icon={FolderOpen}
        onClick={() => void actions.reveal(extension.id)}>
        {t('extensions.modal.reveal')}
      </Button>
      {extension.source ? (
        <Button
          variant="ghost"
          size="sm"
          icon={Store}
          onClick={() => open({ kind: 'listing', id: extension.id })}>
          {t('extensions.modal.inStore')}
        </Button>
      ) : (
        extension.manifest && (
          <Button
            variant="ghost"
            size="sm"
            icon={Upload}
            onClick={() => open({ kind: 'publish', id: extension.id })}>
            {t('extensions.modal.publish')}
          </Button>
        )
      )}
      <div className={styles.footerEnd}>
        {error && <p className={styles.failure}>{t(`extensions.errors.${error}`)}</p>}
        {asking ? (
          <>
            <p className={styles.question}>{t('extensions.modal.removeQuestion')}</p>
            <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
              {t('extensions.modal.cancel')}
            </Button>
            <Button variant="danger" size="sm" onClick={() => void handleRemove()}>
              {t('extensions.modal.removeConfirm')}
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setAsking(true)}>
            {t('extensions.modal.remove')}
          </Button>
        )}
      </div>
    </div>
  )
}
