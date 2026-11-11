import { useState } from 'react'
import { Trash2, ArrowUp, ArrowDown, CircleStop, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { QueueWire, QueueItemWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Badge } from '@agentic-workstation/ui/Badge'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import type { useQueueScreen } from '../QueueScreen.hooks'
import styles from '../QueueScreen.module.scss'
import { inputsText } from '../QueueScreen.utils'
import type { RouteOf } from '../../../../lib/route.types'
import { useRouter } from '../../../../lib/router.store'
import { QUEUE_ITEM_TONES } from '../../../../lib/status.constants'
import { ConfirmDialog } from '../../../../shell/ConfirmDialog/ConfirmDialog'
import { OptionList } from '../../../../shell/OptionList/OptionList'

/**
 * Элемент очереди: сценарий, состояние, ответы на его вопросы. Ждущий - переставить, убрать,
 * остановиться после него, запускать только после успеха; прошедший и идущий - открыть прогон.
 */
export const QueueItemCard = ({
  route,
  queue,
  item,
  position,
  waitingCount,
  screen,
}: {
  route: RouteOf<'queue'>
  queue: QueueWire
  item: QueueItemWire
  /** Место среди ждущих; -1 - не ждёт. */
  position: number
  waitingCount: number
  screen: ReturnType<typeof useQueueScreen>
}) => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)
  const [isRemoving, setIsRemoving] = useState(false)
  const waiting = item.state === 'waiting'
  const stopsAfter = queue.stopAfterItemId === item.id
  const { queueAction, busy } = screen
  const facts = [
    inputsText(item.inputs),
    item.refusal && t('queue.refused', { code: item.refusal }),
  ]

  const handleOpen = () =>
    navigate({
      name: 'run',
      agentId: route.agentId,
      projectKey: route.projectKey,
      runId: item.runId,
    })

  return (
    <div className={styles.item}>
      <div className={styles.itemHead}>
        <span className={styles.itemName}>{item.scenarioName}</span>
        {stopsAfter && <Badge tone="warning">{t('queue.stopsHere')}</Badge>}
        <Badge tone={QUEUE_ITEM_TONES[item.state] ?? 'neutral'}>
          {t(`itemState.${item.state}`)}
        </Badge>
        {!waiting && item.runId && (
          <IconButton
            icon={ChevronRight}
            size="touch"
            label={t('queue.openRun')}
            onClick={handleOpen}
          />
        )}
      </div>
      {facts.some(Boolean) && (
        <p className={styles.itemMeta}>{facts.filter(Boolean).join(' · ')}</p>
      )}
      {waiting && (
        <>
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
              onClick={() =>
                queueAction({ kind: 'stopAfter', itemId: stopsAfter ? null : item.id })
              }
            />
            <IconButton
              icon={Trash2}
              size="touch"
              label={t('queue.remove')}
              disabled={busy}
              onClick={() => setIsRemoving(true)}
            />
          </div>
        </>
      )}
      <ConfirmDialog
        open={isRemoving}
        title={t('queue.removeConfirm', { name: item.scenarioName })}
        confirmLabel={t('queue.remove')}
        onConfirm={() => queueAction({ kind: 'remove', itemId: item.id })}
        onClose={() => setIsRemoving(false)}
      />
    </div>
  )
}
