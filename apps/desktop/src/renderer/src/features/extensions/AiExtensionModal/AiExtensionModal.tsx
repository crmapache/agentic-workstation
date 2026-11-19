import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ProviderId } from '@shared/providers'

import { Button } from '@agentic-workstation/ui/Button'
import { ChoiceField } from '@agentic-workstation/ui/ChoiceField'
import { Modal } from '@agentic-workstation/ui/Modal'
import { TextArea } from '@agentic-workstation/ui/TextArea'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useExtensionActions } from '../extensions.actions'
import { useExtensionsStore } from '../extensions.store'
import { PROVIDER_VIEW_OF } from '../../../state/layout.constants'
import { useLayoutStore } from '../../../state/layout.store'
import { useProviders, effectiveProvider } from '../../../state/providers.queries'
import styles from './AiExtensionModal.module.scss'
import type { AiExtensionModalProps } from './AiExtensionModal.types'

/**
 * Расширение с ИИ (ADR 0091): человек говорит своими словами, что оно должно делать, и выбирает,
 * кто строит. IDE кладёт заготовку, открывает папку проектом и начинает там разговор - дальше
 * человек смотрит, как расширение появляется и перезагружается.
 */
export const AiExtensionModal = ({ extension }: AiExtensionModalProps) => {
  const { t } = useTranslation()
  const { data: providers = [] } = useProviders()
  const actions = useExtensionActions()
  const close = useExtensionsStore((store) => store.close)
  const error = useExtensionsStore((store) => store.error)
  const [name, setName] = useState('')
  const [request, setRequest] = useState('')
  const [chosen, setChosen] = useState<ProviderId | null>(null)
  const [busy, setBusy] = useState(false)
  const provider = effectiveProvider(providers, chosen)
  const ready =
    request.trim() !== '' && (extension !== null || name.trim() !== '') && provider?.available

  const handleStart = async () => {
    if (!provider || !ready) return

    setBusy(true)

    const ok = extension
      ? await actions.editWithAi(extension.id, request, provider.id)
      : await actions.create(name, request, provider.id)

    setBusy(false)

    if (!ok) return

    // Разговор, который строит расширение, - на виду: панель выбранного провайдера.
    useLayoutStore.getState().showProviderView(PROVIDER_VIEW_OF[provider.id])
    close()
  }

  return (
    <Modal
      open
      icon={Sparkles}
      iconTone="accent"
      title={
        extension
          ? t('extensions.ai.editTitle', { name: extension.manifest?.name ?? extension.id })
          : t('extensions.ai.newTitle')
      }
      closeLabel={t('extensions.modal.close')}
      onClose={close}
      footer={
        <div className={styles.actions}>
          <Button variant="ghost" size="sm" onClick={close}>
            {t('extensions.ai.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Sparkles}
            disabled={!ready || busy}
            onClick={() => void handleStart()}>
            {extension ? t('extensions.ai.startEdit') : t('extensions.ai.start')}
          </Button>
        </div>
      }>
      <div className={styles.form}>
        {!extension && (
          <TextField
            label={t('extensions.ai.name')}
            placeholder={t('extensions.ai.namePlaceholder')}
            value={name}
            onChange={setName}
          />
        )}
        <TextArea
          label={extension ? t('extensions.ai.editRequest') : t('extensions.ai.request')}
          placeholder={t('extensions.ai.requestPlaceholder')}
          value={request}
          onChange={setRequest}
        />
        <ChoiceField
          label={t('extensions.ai.provider')}
          value={provider?.id ?? ''}
          options={providers.map((one) => ({
            value: one.id,
            label: one.label,
            disabled: !one.available,
          }))}
          onPick={(value) => setChosen(value as ProviderId)}
        />
        <p className={styles.hint}>{t('extensions.ai.hint')}</p>
        {error && <p className={styles.failure}>{t(`extensions.errors.${error}`)}</p>}
      </div>
    </Modal>
  )
}
