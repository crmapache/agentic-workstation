import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { QueueWaitWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'

import { QUEUE_NAMES } from '../QueueScreen.constants'
import type { useQueueScreen } from '../QueueScreen.hooks'
import styles from '../QueueScreen.module.scss'
import { ConfirmDialog } from '../../../../shell/ConfirmDialog/ConfirmDialog'

/**
 * Очередь ждёт своей очереди к папке проекта (ADR 0128 IDE): кого ждёт и сколько очередей впереди;
 * держатель стоит на недоделанном - что стоит и что с ним сделать. «Run alongside now» - не ждать,
 * после вопроса: обе очереди будут править одни файлы.
 */
export const QueueTurn = ({
  wait,
  screen,
}: {
  wait: QueueWaitWire
  screen: ReturnType<typeof useQueueScreen>
}) => {
  const { t } = useTranslation()
  const [isAsking, setIsAsking] = useState(false)
  const stuck = wait.holders.find((holder) => holder.unfinished !== '')
  const names = QUEUE_NAMES.format(wait.holders.map((holder) => holder.name))
  const text = stuck
    ? t('queue.turnUnfinished', { name: stuck.unfinished, queue: stuck.name })
    : wait.holders.length > 0
      ? t('queue.turnWorking', { names })
      : t('queue.turnSoon')

  return (
    <Card
      title={t('queue.turnTitle')}
      description={wait.ahead > 0 ? t('queue.turnAhead', { count: wait.ahead }) : undefined}>
      <p className={styles.rest}>{text}</p>
      <Button
        size="touch"
        variant="secondary"
        disabled={screen.busy}
        onClick={() => setIsAsking(true)}>
        {t('queue.alongside')}
      </Button>
      <ConfirmDialog
        open={isAsking}
        tone="primary"
        title={t('queue.alongsideConfirm')}
        text={t('queue.alongsideText', { names })}
        confirmLabel={t('queue.alongside')}
        onConfirm={() => screen.queueAction({ kind: 'alongside' })}
        onClose={() => setIsAsking(false)}
      />
    </Card>
  )
}
