import type { MouseEvent } from 'react'
import clsx from 'clsx'
import { Play, CheckCheck, OctagonPause } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { isAreaPress } from '@agentic-workstation/ui/Card.utils'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { MARK_ICON_SIZE } from '../QueueCard.constants'
import { useOpenRun } from '../QueueCard.hooks'
import styles from '../QueueCard.module.scss'
import type { QueueItemChipProps } from '../QueueCard.types'
import { answerChips } from '../../scenarios-forms.utils'
import { waitingItems, canCarryOnFromRow } from '../../scenarios-queues.utils'
import { useScenarioActions } from '../../scenarios.actions'
import { ScenarioAlert } from '../../ScenarioAlert/ScenarioAlert'
import { ScenarioFormsAnswers } from '../../ScenarioFormsAnswers/ScenarioFormsAnswers'
import { ScenarioStatePill } from '../../ScenarioStatePill/ScenarioStatePill'
import { QueueItemMenu } from './QueueItemMenu'
import { QueueItemRunsOn } from './QueueItemRunsOn'

/**
 * Один сценарий очереди строкой во всю ширину: место, имя, состояние, на какой модели и с каким
 * усилием идёт, метка «встанет после него», ответы. С прогоном строка нажимается вся и открывает его (клавиатуре - кнопка имени). Ждущий
 * носит меню у правого края: сдвинуть, остановить после, убрать; идущий - там же остановить после
 * или оборвать сейчас. Упавший или остановленный носит там же «Mark done»: работу
 * доделали руками (в разговоре головы), и очередь должна считать её сделанной. Последний из них,
 * если полоса остановки не зовёт к тому же, - ещё и «Continue»: прогон, оборванный
 * перезапуском IDE, продолжается с места прямо со строки. Отказ старта - под
 * именем, если его не сказала полоса остановки. Пометка - карточка трекера без сценария - бледная,
 * с «Skipped» сразу: очередь пройдёт мимо неё.
 */
export const QueueItemChip = ({ queue, item, number, live }: QueueItemChipProps) => {
  const { t } = useTranslation()
  const openRun = useOpenRun(queue.id)
  const actions = useScenarioActions()
  const waiting = waitingItems(queue)
  const place = waiting.findIndex((one) => one.id === item.id)
  const isWaiting = item.state === 'waiting'
  const isRunning = item.state === 'running'
  const isMarked = queue.stopAfterItemId === item.id
  const isHeldOnIt = queue.hold?.reason === 'refused' && queue.hold.itemId === item.id
  const refusal =
    item.refusal && !isHeldOnIt
      ? t('scenarios.queues.items.refused', {
          why: t(`scenarios.codes.${item.refusal}`, { defaultValue: t('scenarios.codes.unknown') }),
        })
      : ''
  const canMarkDone = item.state === 'failed' || item.state === 'stopped'
  const canCarryOn = canCarryOnFromRow(queue, item)
  const condition = item.placeholder
    ? t('scenarios.queues.items.placeholder')
    : item.doneByHand
      ? t('scenarios.queues.items.doneByHand')
      : ''
  const hasAnswers = answerChips(item.inputs).length > 0

  const handleOpen = () => openRun(item.runId)

  const handleMarkDone = () => void actions.queue(queue.id, { kind: 'markDone', itemId: item.id })

  const handleCarryOn = () => void actions.carryOn(item.runId)

  const handleAreaClick = (event: MouseEvent<HTMLLIElement>) => {
    if (isAreaPress(event)) handleOpen()
  }

  return (
    <li
      className={clsx(
        styles.item,
        item.state === 'running' && styles.itemRunning,
        item.runId && styles.itemPressable,
        item.placeholder && styles.itemPlaceholder,
      )}
      onClick={item.runId ? handleAreaClick : undefined}>
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
        {item.placeholder || item.state === 'skipped' ? (
          <ScenarioStatePill of="step" state="skipped" />
        ) : item.state === 'running' ? (
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
        {item.runsOn && <QueueItemRunsOn provider={item.provider} runsOn={item.runsOn} />}
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
        {canMarkDone && (
          <span className={styles.itemEnd}>
            {canCarryOn && (
              <Tooltip label={t('scenarios.run.carryOnHint')}>
                <Button size="sm" variant="primary" icon={Play} onClick={handleCarryOn}>
                  {t('scenarios.queues.items.carryOn')}
                </Button>
              </Tooltip>
            )}
            <Tooltip label={t('scenarios.queues.items.markDoneHint')}>
              <Button size="sm" variant="ghost" icon={CheckCheck} onClick={handleMarkDone}>
                {t('scenarios.queues.items.markDone')}
              </Button>
            </Tooltip>
          </span>
        )}
        {(isWaiting || isRunning) && (
          <span className={styles.itemEnd}>
            <QueueItemMenu
              queue={queue}
              item={item}
              runId={isRunning ? (live?.id ?? null) : null}
              isFirst={place === 0}
              isLast={place === waiting.length - 1}
            />
          </span>
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
