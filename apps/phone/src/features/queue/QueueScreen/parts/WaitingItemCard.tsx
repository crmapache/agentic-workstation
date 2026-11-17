import { useState } from 'react'
import { Trash2, ArrowUp, ArrowDown, CircleStop } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { QueueWire, QueueItemWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Badge } from '@agentic-workstation/ui/Badge'
import { Card } from '@agentic-workstation/ui/Card'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import type { useQueueScreen } from '../QueueScreen.hooks'
import styles from '../QueueScreen.module.scss'
import type { Confirmation } from '../QueueScreen.types'
import { itemFacts } from '../QueueScreen.utils'
import { ConfirmDialog } from '../../../../shell/ConfirmDialog/ConfirmDialog'
import { OptionList } from '../../../../shell/OptionList/OptionList'

/**
 * Ждущий элемент очереди: сценарий и ответы на его вопросы, «только после успеха», переставить,
 * остановить очередь после него, убрать. Каждое действие кнопкой - через «точно?»: значки стоят
 * плотно, и палец, листающий карточки, задевал их случайно.
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
  const [confirming, setConfirming] = useState<Confirmation | null>(null)
  const stopsAfter = queue.stopAfterItemId === item.id
  const { queueAction, busy } = screen
  const name = item.scenarioName

  const handleMove = (by: -1 | 1) =>
    setConfirming({
      title: t(by < 0 ? 'queue.moveUpConfirm' : 'queue.moveDownConfirm', { name }),
      label: t(by < 0 ? 'queue.moveUp' : 'queue.moveDown'),
      tone: 'primary',
      onConfirm: () => queueAction({ kind: 'move', itemId: item.id, by }),
    })

  const handleStopAfter = () =>
    setConfirming({
      title: t(stopsAfter ? 'queue.keepGoingConfirm' : 'queue.stopAfterConfirm', { name }),
      label: t(stopsAfter ? 'queue.keepGoing' : 'queue.stopAfterThis'),
      tone: 'primary',
      onConfirm: () => queueAction({ kind: 'stopAfter', itemId: stopsAfter ? null : item.id }),
    })

  const handleRemove = () =>
    setConfirming({
      title: t('queue.removeConfirm', { name }),
      label: t('queue.remove'),
      tone: 'danger',
      onConfirm: () => queueAction({ kind: 'remove', itemId: item.id }),
    })

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
            onClick={() => handleMove(-1)}
          />
          <IconButton
            icon={ArrowDown}
            size="touch"
            label={t('queue.moveDown')}
            disabled={busy || position >= waitingCount - 1}
            onClick={() => handleMove(1)}
          />
          <IconButton
            icon={CircleStop}
            size="touch"
            label={t(stopsAfter ? 'queue.keepGoing' : 'queue.stopAfterThis')}
            active={stopsAfter}
            disabled={busy}
            onClick={handleStopAfter}
          />
          <IconButton
            icon={Trash2}
            size="touch"
            label={t('queue.remove')}
            disabled={busy}
            onClick={handleRemove}
          />
        </div>
      </div>
      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.title ?? ''}
        text={confirming?.text}
        confirmLabel={confirming?.label ?? ''}
        tone={confirming?.tone}
        onConfirm={() => confirming?.onConfirm()}
        onClose={() => setConfirming(null)}
      />
    </Card>
  )
}
