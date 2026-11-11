import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Toast } from '@agentic-workstation/ui/Toast'

import { useUpdateStatus, useUpdateActions } from '../../../state/updates.queries'
import { RETRYABLE_FAILURES } from './UpdateNotice.constants'

/**
 * Уведомление о новой версии IDE в углу окна. Само ничего не решает: состояние
 * ведёт главный процесс, отсюда уходят только «обновить», «скачать» и «позже».
 * Если поставить из приложения нельзя, вместо «обновить» - «скачать» и причина.
 */
export const UpdateNotice = () => {
  const { t } = useTranslation()
  const { data: status } = useUpdateStatus()
  const { install, dismiss, openReleasePage } = useUpdateActions()

  if (!status || status.kind === 'idle') return null

  const laterButton = (
    <Button variant="ghost" size="sm" onClick={dismiss}>
      {t('updates.later')}
    </Button>
  )

  if (status.kind === 'available') {
    const isManual = status.install.mode === 'manual'
    const description =
      status.install.mode === 'manual'
        ? t(`updates.manualReason.${status.install.reason}`)
        : t('updates.availableText')

    return (
      <Toast
        title={t('updates.availableTitle', { version: status.version })}
        description={description}
        actions={
          <>
            <Button
              variant="primary"
              size="sm"
              data-action="update-install"
              onClick={isManual ? openReleasePage : install}>
              {isManual ? t('updates.download') : t('updates.install')}
            </Button>
            {laterButton}
          </>
        }
      />
    )
  }

  if (status.kind === 'downloading') {
    return (
      <Toast
        title={t('updates.downloadingTitle', { version: status.version })}
        description={t('updates.downloadingText', { percent: Math.round(status.progress * 100) })}
        progress={status.progress}
      />
    )
  }

  if (status.kind === 'installing') {
    return (
      <Toast
        title={t('updates.installingTitle', { version: status.version })}
        description={t('updates.installingText')}
      />
    )
  }

  return (
    <Toast
      tone="danger"
      title={t('updates.failedTitle', { version: status.version })}
      description={t(`updates.failureReason.${status.reason}`)}
      actions={
        <>
          {RETRYABLE_FAILURES.has(status.reason) && (
            <Button variant="primary" size="sm" onClick={install}>
              {t('updates.retry')}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={openReleasePage}>
            {t('updates.download')}
          </Button>
          {laterButton}
        </>
      }
    />
  )
}
