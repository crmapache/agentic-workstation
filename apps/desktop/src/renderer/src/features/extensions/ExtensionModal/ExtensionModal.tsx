import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Section } from '@agentic-workstation/ui/Section'
import { Switch } from '@agentic-workstation/ui/Switch'

import { useExtensionActions } from '../extensions.actions'
import { STATUS_TONES } from '../extensions.constants'
import { useExtensionsStore } from '../extensions.store'
import { GrantList } from '../GrantList/GrantList'
import { extensionIcon } from '../../../lib/extension-icons'
import styles from './ExtensionModal.module.scss'
import type { ExtensionModalProps } from './ExtensionModal.types'
import { workingGrant } from './ExtensionModal.utils'
import { ApprovalCard } from './parts/ApprovalCard'
import { Contributions } from './parts/Contributions'
import { ExtensionFooter } from './parts/ExtensionFooter'
import { ExtensionLog } from './parts/ExtensionLog'
import { ExtensionSettings } from './parts/ExtensionSettings'

/**
 * Расширение окном по центру (ADR 0091): в шапке - статус и «включено», слева - причина сбоя,
 * просьба прав, что ему выдано и его настройки, справа - что оно внесло в IDE и журнал.
 */
export const ExtensionModal = ({ extension }: ExtensionModalProps) => {
  const { t } = useTranslation()
  const actions = useExtensionActions()
  const close = useExtensionsStore((store) => store.close)
  const { manifest } = extension
  const working = workingGrant(extension)

  return (
    <Modal
      open
      size="lg"
      icon={extensionIcon(manifest?.icon)}
      iconTone="accent"
      title={manifest?.name ?? extension.id}
      description={
        extension.source
          ? t('extensions.modal.fromStore', extension.source)
          : manifest
            ? t('extensions.modal.subtitle', { version: manifest.version, id: extension.id })
            : extension.id
      }
      headerActions={
        <>
          <Badge tone={STATUS_TONES[extension.status]}>
            {t(`extensions.status.${extension.status}`)}
          </Badge>
          <Switch
            label={t('extensions.modal.enabled')}
            labelHidden
            checked={extension.status !== 'disabled'}
            onChange={(enabled) => void actions.setEnabled(extension.id, enabled)}
          />
        </>
      }
      footer={<ExtensionFooter extension={extension} />}
      closeLabel={t('extensions.modal.close')}
      onClose={close}>
      <div className={styles.layout}>
        <div className={styles.columns}>
          <div className={styles.column}>
            {manifest?.description && <p className={styles.hint}>{manifest.description}</p>}
            {extension.problem && (
              <Section size="sm" title={t('extensions.modal.problem')}>
                <pre className={styles.problem}>{extension.problem.detail}</pre>
              </Section>
            )}
            <ApprovalCard extension={extension} />
            <Section
              size="sm"
              title={t('extensions.modal.granted')}
              description={
                working.permissions.length ? undefined : t('extensions.modal.nothingGranted')
              }>
              {working.permissions.length > 0 && <GrantList grant={working} />}
            </Section>
            <ExtensionSettings extension={extension} />
          </div>
          <div className={clsx(styles.column, styles.side)}>
            <Contributions extension={extension} />
            <ExtensionLog extension={extension} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
