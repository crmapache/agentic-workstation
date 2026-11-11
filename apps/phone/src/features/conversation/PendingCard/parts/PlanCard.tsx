import { useState } from 'react'
import { ListChecks } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'
import { TextArea } from '@agentic-workstation/ui/TextArea'

import styles from '../PendingCard.module.scss'
import type { PendingOf, PendingCardProps } from '../PendingCard.types'
import { Markdown } from '../../../../shell/Markdown/Markdown'

/**
 * План на одобрение: одобрить (режим разговора не меняется - «и принимать правки» решают за
 * столом) или доработать словами.
 */
export const PlanCard = ({
  pending,
  busy,
  onDecide,
}: PendingCardProps & { pending: PendingOf<'plan'> }) => {
  const { t } = useTranslation()
  const [isRefining, setIsRefining] = useState(false)
  const [feedback, setFeedback] = useState('')

  const handleRefine = () => {
    if (!isRefining) return setIsRefining(true)

    onDecide(pending.requestId, { kind: 'plan', approve: false, feedback: feedback.trim() })
  }

  return (
    <Card tone="accent" icon={ListChecks} title={t('pending.plan.title')}>
      <div className={styles.body}>
        <div className={styles.plan}>
          <Markdown text={pending.plan} />
        </div>
        {isRefining && (
          <TextArea
            label={t('pending.plan.feedback')}
            placeholder={t('pending.plan.feedbackPlaceholder')}
            value={feedback}
            onChange={setFeedback}
          />
        )}
        <div className={styles.actions}>
          <Button
            size="touch"
            variant="secondary"
            disabled={busy || (isRefining && !feedback.trim())}
            onClick={handleRefine}>
            {t(isRefining ? 'pending.plan.sendFeedback' : 'pending.plan.refine')}
          </Button>
          <Button
            size="touch"
            variant="primary"
            disabled={busy}
            onClick={() => onDecide(pending.requestId, { kind: 'plan', approve: true })}>
            {t('pending.plan.approve')}
          </Button>
        </div>
      </div>
    </Card>
  )
}
