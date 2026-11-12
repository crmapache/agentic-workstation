import { Import } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { useExistingAdd } from '../AiJobModal.hooks'
import type { AiExistingReviewProps } from '../AiJobModal.types'
import styles from '../../ConnectorsView/ConnectorsView.module.scss'
import { importScope } from '../../ConnectorsView/ConnectorsView.utils'

/**
 * Сервер, который у человека уже настроен в Claude Code (часто - его собственный продукт):
 * перенос берёт его вместе с сохранённым входом, ключа ИИ не видел. Подписи - как в окне
 * переноса: где виден, уже добавлен, нужен ли вход заново.
 */
export const AiExistingReview = ({ proposal, onAdded }: AiExistingReviewProps) => {
  const { t } = useTranslation()
  const existing = useExistingAdd(proposal, onAdded)
  const { candidate } = existing
  const scope = importScope(candidate)
  const notes = [
    candidate.target,
    t(`connectors.import.scopes.${scope.key}`, { name: scope.project }),
    candidate.needsSignIn ? t('connectors.import.signIn') : '',
  ].filter(Boolean)

  return (
    <div className={styles.form}>
      <p className={styles.host}>
        {t('connectors.ai.existing.server')}{' '}
        <span className={styles.hostName}>{candidate.name}</span>
      </p>
      <p className={styles.hint}>{notes.join(' · ')}</p>
      <p className={styles.hint}>{t('connectors.ai.existing.hint')}</p>
      {candidate.blocked && (
        <p className={styles.warning}>{t(`connectors.import.blocked.${candidate.blocked}`)}</p>
      )}
      {existing.isGone && <p className={styles.failure}>{t('connectors.ai.existing.gone')}</p>}
      {existing.skipped && (
        <p className={styles.failure}>{t(`connectors.import.reasons.${existing.skipped}`)}</p>
      )}
      <div className={styles.formActions}>
        <Button
          size="sm"
          variant="primary"
          icon={Import}
          disabled={existing.isBusy || existing.isGone || Boolean(candidate.blocked)}
          onClick={existing.add}>
          {t('connectors.ai.existing.add')}
        </Button>
      </div>
    </div>
  )
}
