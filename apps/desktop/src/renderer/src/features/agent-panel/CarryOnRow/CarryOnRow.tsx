import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { useNow } from '../clock.hooks'
import { usePutPanelState } from '../panel-state.hooks'
import { formatClock } from '../UserMessage/UserMessage.utils'
import { invoke } from '../../../lib/ipc'
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
  const put = usePutPanelState('claude')
  const plan = conversation.carryOn
  const now = useNow(plan !== undefined, CARRY_ON_TICK_MS)

  if (!plan || conversation.status !== 'idle' || plan.until <= now) return null

  const clock = formatClock(plan.until)

  const handleCancel = () =>
    void put(invoke('claudePanel:cancelCarryOn', { conversationId: conversation.id }))

  return (
    <div className={styles.carryOnRow} role="status">
      <span className={styles.label}>{t('agentPanel.carryOn.label')}</span>
      <span className={styles.text}>
        {plan.guess
          ? t('agentPanel.carryOn.guessed', { clock })
          : t('agentPanel.carryOn.planned', { clock })}
      </span>
      <Button size="sm" variant="ghost" onClick={handleCancel}>
        {t('agentPanel.carryOn.cancel')}
      </Button>
    </div>
  )
}
