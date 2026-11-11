import { useTranslation } from 'react-i18next'

import type { ClaudeState } from '@shared/claude'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@agentic-workstation/ui/Button'

import { useNow } from '../clock.hooks'
import { formatClock } from '../UserMessage/UserMessage.utils'
import { invoke } from '../../../lib/ipc'
import { QUERY_KEYS } from '../../../state/query-keys'
import { CARRY_ON_TICK_MS } from './CarryOnRow.constants'
import styles from './CarryOnRow.module.scss'
import type { CarryOnRowProps } from './CarryOnRow.types'

/**
 * План продолжить разговор после лимита - строкой в конце ленты (как в ACC): PANEL, когда
 * панель продолжит сама (или попробует, если лимит не сказал), и «Don't continue». Цвет
 * акцента, а не предупреждения: ничего не сломано, панель говорит, что сделает. Над идущим
 * ходом и после своего срока строки нет.
 */
export const CarryOnRow = ({ conversation }: CarryOnRowProps) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const plan = conversation.carryOn
  const now = useNow(plan !== undefined, CARRY_ON_TICK_MS)

  if (!plan || conversation.status !== 'idle' || plan.until <= now) return null

  const clock = formatClock(plan.until)

  const handleCancel = () => {
    invoke('claudePanel:cancelCarryOn', { conversationId: conversation.id })
      .then((state) => queryClient.setQueryData<ClaudeState>(QUERY_KEYS.claudeState, state))
      .catch((error: unknown) => console.warn('[claude-code] план продолжения не снят:', error))
  }

  return (
    <div className={styles.carryOnRow} role="status">
      <span className={styles.label}>{t('claudeCode.carryOn.label')}</span>
      <span className={styles.text}>
        {plan.guess
          ? t('claudeCode.carryOn.guessed', { clock })
          : t('claudeCode.carryOn.planned', { clock })}
      </span>
      <Button size="sm" variant="ghost" onClick={handleCancel}>
        {t('claudeCode.carryOn.cancel')}
      </Button>
    </div>
  )
}
