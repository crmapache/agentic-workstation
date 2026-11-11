import { Square, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../Composer.module.scss'
import type { SendButtonsProps } from '../Composer.types'
import { useClaudeActions } from '../../claude-actions.hooks'
import { TICK_MS, FORCE_STOP_AFTER_MS } from '../../claude.constants'
import { useNow } from '../../clock.hooks'
import { SEND_KEY_HINT } from '../../composer.constants'
import { FitLabel } from './FitLabel'

/**
 * Кнопки хода справа, в порядке ACC: Stop и «не отвечает · погасить» встают перед парой
 * Queue и Send, не разрывая её. Queue видна всегда и неактивна, когда ждать нечего; у
 * команды «!» её нет, а Send становится Run; у вопроса сбоку (/btw) - Ask aside. Подсказка
 * на Send - только клавиша. На узкой панели Queue и Send сужаются до первой буквы - после
 * того как ряд отдал всё, что мог (composer-fit.utils.ts), а не переносятся строкой ниже.
 */
export const SendButtons = ({
  conversation,
  canSend,
  isShell,
  isAside,
  keyQueues,
  onSend,
  onQueue,
}: SendButtonsProps) => {
  const { t } = useTranslation()
  const { interrupt, forceStop } = useClaudeActions()
  const isRunning = conversation !== null && conversation.status !== 'idle'
  const stoppedAt = conversation?.stopRequestedAt ?? null
  const now = useNow(stoppedAt !== null, TICK_MS)
  const isStalled = stoppedAt !== null && now - stoppedAt > FORCE_STOP_AFTER_MS
  const queueHint = keyQueues ? SEND_KEY_HINT : t('claudeCode.composer.queueHint')
  const sendHint = isShell
    ? t('claudeCode.composer.runHint')
    : isAside
      ? t('claudeCode.aside.askAsideHint')
      : keyQueues && isRunning
        ? ''
        : SEND_KEY_HINT
  const sendLabel = isShell
    ? t('claudeCode.composer.run')
    : isAside
      ? t('claudeCode.aside.askAside')
      : t('claudeCode.composer.send')

  const handleStop = () => conversation && void interrupt(conversation.id)

  const handleForceStop = () => conversation && void forceStop(conversation.id)

  const send = (
    <Button size="sm" variant="primary" disabled={!canSend} onClick={onSend}>
      <FitLabel text={sendLabel} />
    </Button>
  )

  return (
    <div className={styles.sendButtons}>
      {isRunning && (
        <Button size="sm" variant="secondary" icon={Square} onClick={handleStop}>
          {t('claudeCode.composer.stop')}
        </Button>
      )}
      {isStalled && (
        <Tooltip label={t('claudeCode.composer.forceStopHint')} placement="top">
          <Button size="sm" variant="ghost" icon={TriangleAlert} onClick={handleForceStop}>
            {t('claudeCode.composer.forceStop')}
          </Button>
        </Tooltip>
      )}
      {!isShell && !isAside && (
        <span className={styles.shrinking}>
          <Tooltip label={queueHint} placement="top">
            <Button
              size="sm"
              variant="secondary"
              disabled={!isRunning || !canSend || !conversation}
              onClick={onQueue}>
              <FitLabel text={t('claudeCode.composer.queue')} />
            </Button>
          </Tooltip>
        </span>
      )}
      <span className={styles.shrinking}>
        {sendHint ? (
          <Tooltip label={sendHint} placement="top">
            {send}
          </Tooltip>
        ) : (
          send
        )}
      </span>
    </div>
  )
}
