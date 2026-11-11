import { useState } from 'react'
import { ShieldQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../PendingCard.module.scss'
import type { PendingOf, PendingCardProps } from '../PendingCard.types'
import { permissionDetail } from '../PendingCard.utils'

/** Разрешение на вызов: один раз или нет. «Разрешать всегда» решают только за столом. */
export const PermissionCard = ({
  pending,
  pendingCount,
  busy,
  onDecide,
}: PendingCardProps & { pending: PendingOf<'permission'> }) => {
  const { t } = useTranslation()
  const [message, setMessage] = useState('')
  const detail = permissionDetail(pending)

  const handleDeny = () =>
    onDecide(pending.requestId, {
      kind: 'permission',
      allow: false,
      ...(message.trim() && { message: message.trim() }),
    })

  return (
    <Card
      tone="accent"
      icon={ShieldQuestion}
      title={t('pending.permission.title', { tool: pending.toolName })}
      description={pendingCount > 1 ? t('pending.more', { count: pendingCount - 1 }) : undefined}>
      <div className={styles.body}>
        {pending.description && pending.description !== detail && (
          <p className={styles.lead}>{pending.description}</p>
        )}
        <pre className={styles.detail}>{detail}</pre>
        {pending.reason && <p className={styles.note}>{pending.reason}</p>}
        <TextField
          label={t('pending.permission.instead')}
          placeholder={t('pending.permission.insteadPlaceholder')}
          value={message}
          onChange={setMessage}
        />
        <div className={styles.actions}>
          <Button size="touch" variant="danger" disabled={busy} onClick={handleDeny}>
            {t('pending.permission.deny')}
          </Button>
          <Button
            size="touch"
            variant="primary"
            disabled={busy}
            onClick={() => onDecide(pending.requestId, { kind: 'permission', allow: true })}>
            {t('pending.permission.allowOnce')}
          </Button>
        </div>
      </div>
    </Card>
  )
}
