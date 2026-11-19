import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'

import styles from '../ExtensionModal.module.scss'
import type { ExtensionPartProps } from '../ExtensionModal.types'
import { useExtensionActions } from '../../extensions.actions'
import { GrantList } from '../../GrantList/GrantList'

/**
 * Просьба прав, которых человек ещё не выдал: что именно и насколько опасно, одна кнопка -
 * выдать всё, о чём просит манифест сейчас. Без неё расширение не запускается.
 */
export const ApprovalCard = ({ extension }: ExtensionPartProps) => {
  const { t } = useTranslation()
  const actions = useExtensionActions()
  const requests = extension.manifest?.requests

  if (extension.status !== 'needsApproval' || !requests) return null

  return (
    <Card
      tone="accent"
      title={t('extensions.modal.approveTitle')}
      description={t('extensions.modal.approveText')}>
      <div className={styles.stack}>
        <GrantList grant={requests} />
        <div>
          <Button
            variant="primary"
            size="sm"
            icon={ShieldCheck}
            onClick={() => void actions.approve(extension.id)}>
            {t('extensions.modal.approve')}
          </Button>
        </div>
      </div>
    </Card>
  )
}
