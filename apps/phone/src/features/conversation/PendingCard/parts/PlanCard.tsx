import { useState } from 'react'
import { ListChecks } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { TextArea } from '@agentic-workstation/ui/TextArea'

import styles from '../PendingCard.module.scss'
import type { PendingOf, PendingCardProps } from '../PendingCard.types'
import { Dock } from '../../../../shell/Dock/Dock'
import { Markdown } from '../../../../shell/Markdown/Markdown'
import { TooLongNote } from '../../../../shell/TooLongNote/TooLongNote'

/**
 * План на одобрение: одобрить (режим разговора не меняется - «и принимать правки» решают за
 * столом) или доработать словами. Урезанный по дороге план не одобряется - только доработать.
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

  const handleApprove = () => onDecide(pending.requestId, { kind: 'plan', approve: true })

  return (
    <Dock
      icon={ListChecks}
      title={t('pending.plan.title')}
      actions={
        <>
          <Button
            size="touch"
            variant="secondary"
            disabled={busy || (isRefining && !feedback.trim())}
            onClick={handleRefine}>
            {t(isRefining ? 'pending.plan.sendFeedback' : 'pending.plan.refine')}
          </Button>
          {!pending.truncated && (
            <Button size="touch" variant="primary" disabled={busy} onClick={handleApprove}>
              {t('pending.plan.approve')}
            </Button>
          )}
        </>
      }>
      {pending.truncated && <TooLongNote />}
      {pending.plan && (
        <div className={styles.plan}>
          <Markdown text={pending.plan} />
        </div>
      )}
      {isRefining && (
        <TextArea
          label={t('pending.plan.feedback')}
          placeholder={t('pending.plan.feedbackPlaceholder')}
          value={feedback}
          onChange={setFeedback}
        />
      )}
    </Dock>
  )
}
