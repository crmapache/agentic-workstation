import { useState } from 'react'
import { ShieldQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../PendingCard.module.scss'
import type { PendingOf, PendingCardProps } from '../PendingCard.types'
import { modelWords, cannotReview, permissionDetail } from '../PendingCard.utils'
import { Dock } from '../../../../shell/Dock/Dock'
import { PathText } from '../../../../shell/PathText/PathText'
import { TooLongNote } from '../../../../shell/TooLongNote/TooLongNote'

/**
 * Разрешение на вызов: один раз или нет. «Разрешать всегда» решают только за столом. Вызов -
 * целиком, в своём прокручиваемом блоке; слова модели о нём - отдельно и подписаны как её. Вопрос,
 * урезанный по дороге, одобрить нельзя - только отказать.
 */
export const PermissionCard = ({
  pending,
  pendingCount,
  busy,
  onDecide,
}: PendingCardProps & { pending: PendingOf<'permission'> }) => {
  const { t } = useTranslation()
  const [message, setMessage] = useState('')
  const blind = cannotReview(pending)
  const detail = pending.input === null ? '' : permissionDetail(pending)
  const said = modelWords(pending)

  const handleDeny = () =>
    onDecide(pending.requestId, {
      kind: 'permission',
      allow: false,
      ...(message.trim() && { message: message.trim() }),
    })

  const handleAllow = () => onDecide(pending.requestId, { kind: 'permission', allow: true })

  return (
    <Dock
      icon={ShieldQuestion}
      title={t('pending.permission.title', { tool: pending.toolName })}
      description={pendingCount > 1 ? t('pending.more', { count: pendingCount - 1 }) : undefined}
      actions={
        <>
          <Button size="touch" variant="danger" disabled={busy} onClick={handleDeny}>
            {t('pending.permission.deny')}
          </Button>
          {!blind && (
            <Button size="touch" variant="primary" disabled={busy} onClick={handleAllow}>
              {t('pending.permission.allowOnce')}
            </Button>
          )}
        </>
      }>
      {blind && <TooLongNote />}
      {pending.description && pending.description !== detail && (
        <p className={styles.lead}>
          <PathText text={pending.description} />
        </p>
      )}
      {detail && (
        <pre className={styles.detail}>
          <PathText text={detail} />
        </pre>
      )}
      {said && (
        <p className={styles.note}>
          <span className={styles.header}>{t('pending.permission.modelSays')}</span> {said}
        </p>
      )}
      {pending.reason && <p className={styles.note}>{pending.reason}</p>}
      <TextField
        size="touch"
        label={t('pending.permission.instead')}
        placeholder={t('pending.permission.insteadPlaceholder')}
        value={message}
        onChange={setMessage}
      />
    </Dock>
  )
}
