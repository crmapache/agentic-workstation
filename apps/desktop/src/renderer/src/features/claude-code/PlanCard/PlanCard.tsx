import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { useClaudeActions } from '../claude-actions.hooks'
import { inputText } from '../claude.utils'
import { useFeedScope, usePendingRequest } from '../feed-scope.context'
import { useFeedStore } from '../feed.store'
import { ElapsedTime } from '../ElapsedTime/ElapsedTime'
import { Markdown } from '../Markdown/Markdown'
import styles from './PlanCard.module.scss'
import type { PlanCardProps } from './PlanCard.types'
import { planSteps } from './PlanCard.utils'

/**
 * План в ленте, как в ACC: «PLAN READY · N steps», сам план и внизу решение - «Approve &
 * run» (дальше правки без вопросов) и «Keep planning». Решённый здесь план из ленты
 * уходит; агент перестал ждать - без кнопок, с пометкой. План из истории - запись.
 */
export const PlanCard = memo(({ tool }: PlanCardProps) => {
  const { t } = useTranslation()
  const { conversationId } = useFeedScope()
  const pending = usePendingRequest()
  const { respond } = useClaudeActions()
  const isDecided = useFeedStore((store) => store.decidedPlans.has(tool.id))
  const decidePlan = useFeedStore((store) => store.decidePlan)
  const plan = inputText(tool.input, 'plan')
  const steps = planSteps(plan)
  const request = pending?.kind === 'plan' && pending.toolUseId === tool.id ? pending : null
  const isWithdrawn = tool.status === 'interrupted' && tool.closedReason !== 'replay'

  const decide = (approved: boolean) => {
    if (!request) return

    decidePlan(tool.id)
    void respond(conversationId, request.requestId, {
      kind: 'plan',
      approved,
      acceptEdits: approved,
      feedback: '',
    })
  }

  const handleApprove = () => decide(true)

  const handleKeepPlanning = () => decide(false)

  if (isDecided) return null

  return (
    <div className={styles.planCard}>
      <div className={styles.head}>
        <span className={styles.label}>{t('claudeCode.feed.plan.label')}</span>
        {steps > 0 && (
          <span className={styles.hint}>{t('claudeCode.feed.plan.steps', { count: steps })}</span>
        )}
      </div>
      <div className={styles.body}>
        <Markdown text={plan} />
      </div>
      <div className={styles.foot}>
        {request && (
          <>
            <Button variant="primary" size="sm" onClick={handleApprove}>
              {t('claudeCode.feed.plan.approve')}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleKeepPlanning}>
              {t('claudeCode.feed.plan.keepPlanning')}
            </Button>
          </>
        )}
        {isWithdrawn && <span className={styles.hint}>{t('claudeCode.feed.plan.withdrawn')}</span>}
        <span className={styles.spacer} />
        <ElapsedTime startedAt={tool.startedAt} endedAt={tool.endedAt} />
      </div>
    </div>
  )
})

PlanCard.displayName = 'PlanCard'
