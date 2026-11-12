import { useState } from 'react'
import { Trash2, ArrowUp, ArrowDown, CircleStop } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { QueueWire, QueueItemWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Badge } from '@agentic-workstation/ui/Badge'
import { Card } from '@agentic-workstation/ui/Card'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import type { useQueueScreen } from '../QueueScreen.hooks'
import styles from '../QueueScreen.module.scss'
import { itemFacts } from '../QueueScreen.utils'
import { ConfirmDialog } from '../../../../shell/ConfirmDialog/ConfirmDialog'
import { OptionList } from '../../../../shell/OptionList/OptionList'

/**
 * Ждущий элемент очереди: сценарий и ответы на его вопросы, «только после успеха», переставить,
 * остановить очередь после него, убрать (с вопросом «точно?»).
 */
export const WaitingItemCard = ({
  queue,
  item,
  position,
  waitingCount,
  screen,
}: {
  queue: QueueWire
  item: QueueItemWire
  /** Место среди ждущих. */
  position: number
  waitingCount: number
  screen: ReturnType<typeof useQueueScreen>
}) => {
  const { t } = useTranslation()
  const [isRemoving, setIsRemoving] = useState(false)
  const stopsAfter = queue.stopAfterItemId === item.id
  const { queueAction, busy } = screen

  return (
    <Card
      size="sm"
      title={item.scenarioName}
      description={itemFacts(t, item) || undefined}
      actions={stopsAfter && <Badge tone="warning">{t('queue.stopsHere')}</Badge>}>
      <div className={styles.waiting}>
        <OptionList
          label={t('queue.afterSuccess')}
          shape="square"
          disabled={busy}
          options={[{ value: 'afterSuccess', label: t('queue.afterSuccess') }]}
          isSelected={() => item.afterSuccess}
          onSelect={() =>
            queueAction({ kind: 'mode', itemId: item.id, afterSuccess: !item.afterSuccess })
          }
        />
        <div className={styles.itemActions}>
          <IconButton
            icon={ArrowUp}
            size="touch"
            label={t('queue.moveUp')}
            disabled={busy || position <= 0}
            onClick={() => queueAction({ kind: 'move', itemId: item.id, by: -1 })}
          />
          <IconButton
            icon={ArrowDown}
            size="touch"
            label={t('queue.moveDown')}
            disabled={busy || position >= waitingCount - 1}
            onClick={() => queueAction({ kind: 'move', itemId: item.id, by: 1 })}
          />
          <IconButton
            icon={CircleStop}
            size="touch"
            label={t(stopsAfter ? 'queue.keepGoing' : 'queue.stopAfterThis')}
            active={stopsAfter}
            disabled={busy}
            onClick={() => queueAction({ kind: 'stopAfter', itemId: stopsAfter ? null : item.id })}
          />
          <IconButton
            icon={Trash2}
            size="touch"
            label={t('queue.remove')}
            disabled={busy}
            onClick={() => setIsRemoving(true)}
          />
        </div>
      </div>
      <ConfirmDialog
        open={isRemoving}
        title={t('queue.removeConfirm', { name: item.scenarioName })}
        confirmLabel={t('queue.remove')}
        onConfirm={() => queueAction({ kind: 'remove', itemId: item.id })}
        onClose={() => setIsRemoving(false)}
      />
    </Card>
  )
}
