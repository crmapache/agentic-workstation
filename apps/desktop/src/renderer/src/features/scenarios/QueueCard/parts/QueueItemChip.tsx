import clsx from 'clsx'
import { OctagonPause } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { MARK_ICON_SIZE } from '../QueueCard.constants'
import { useOpenRun } from '../QueueCard.hooks'
import styles from '../QueueCard.module.scss'
import type { QueueItemChipProps } from '../QueueCard.types'
import { answerChips } from '../../scenarios-forms.utils'
import { waitingItems } from '../../scenarios-queues.utils'
import { ScenarioAlert } from '../../ScenarioAlert/ScenarioAlert'
import { ScenarioFormsAnswers } from '../../ScenarioFormsAnswers/ScenarioFormsAnswers'
import { ScenarioStatePill } from '../../ScenarioStatePill/ScenarioStatePill'
import { QueueItemMenu } from './QueueItemMenu'

/**
 * Один сценарий очереди: место, имя, состояние, метка «встанет после него», ответы. С прогоном -
 * имя открывает его. Ждущий говорит, чего ждёт (успеха предыдущего или любого конца), и носит
 * меню: сдвинуть, остановить после, убрать. Отказ старта - под именем, если его не сказала
 * полоса остановки.
 */
export const QueueItemChip = ({ queue, item, number, live }: QueueItemChipProps) => {
  const { t } = useTranslation()
  const openRun = useOpenRun(queue.id)
  const waiting = waitingItems(queue)
  const place = waiting.findIndex((one) => one.id === item.id)
  const isWaiting = item.state === 'waiting'
  const isMarked = queue.stopAfterItemId === item.id
  const isHeldOnIt = queue.hold?.reason === 'refused' && queue.hold.itemId === item.id
  const refusal =
    item.refusal && !isHeldOnIt
      ? t('scenarios.queues.items.refused', {
          why: t(`scenarios.codes.${item.refusal}`, { defaultValue: t('scenarios.codes.unknown') }),
        })
      : ''
  const condition =
    isWaiting && number > 1
      ? t(`scenarios.queues.items.${item.afterSuccess ? 'afterSuccess' : 'afterAny'}`)
      : ''
  const hasAnswers = answerChips(item.inputs).length > 0

  const handleOpen = () => openRun(item.runId)

  return (
    <li className={clsx(styles.item, item.state === 'running' && styles.itemRunning)}>
      <div className={styles.itemHead}>
        {/* Порядок скринридеру говорит сам список; число - для глаза. */}
        <span className={styles.itemNumber} aria-hidden>
          {number}
        </span>
        {item.runId ? (
          <Tooltip label={t('scenarios.queues.items.open')}>
            <button type="button" className={styles.itemOpen} onClick={handleOpen}>
              {item.scenarioName}
            </button>
          </Tooltip>
        ) : (
          <span className={styles.itemName}>{item.scenarioName}</span>
        )}
        {item.state === 'running' ? (
          <ScenarioStatePill
            of="run"
            state={live?.state ?? 'starting'}
            limited={(live?.limit ?? null) !== null}
          />
        ) : item.state === 'waiting' ? (
          <ScenarioStatePill of="step" state="waiting" />
        ) : (
          <ScenarioStatePill of="run" state={item.state} />
        )}
        {isMarked && (
          <Tooltip label={t('scenarios.queues.items.stopMark')}>
            <OctagonPause
              className={styles.mark}
              size={MARK_ICON_SIZE}
              role="img"
              aria-label={t('scenarios.queues.items.stopMark')}
            />
          </Tooltip>
        )}
        {isWaiting && (
          <QueueItemMenu
            queue={queue}
            item={item}
            isFirst={place === 0}
            isLast={place === waiting.length - 1}
          />
        )}
      </div>
      {refusal && <ScenarioAlert tone="danger">{refusal}</ScenarioAlert>}
      {(condition || hasAnswers) && (
        <div className={styles.itemMeta}>
          {condition && <span className={styles.condition}>{condition}</span>}
          <ScenarioFormsAnswers inputs={item.inputs} />
        </div>
      )}
    </li>
  )
}
