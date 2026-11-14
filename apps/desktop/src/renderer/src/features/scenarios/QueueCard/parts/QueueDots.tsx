import clsx from 'clsx'
import { OctagonPause } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { QueueItem } from '@shared/scenario-queues'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { MARK_ICON_SIZE } from '../QueueCard.constants'
import { useOpenRun } from '../QueueCard.hooks'
import styles from '../QueueCard.module.scss'
import type { QueueDotsProps } from '../QueueCard.types'
import { itemDotTone } from '../../scenarios-queues.utils'

/**
 * Элементы очереди точками плотной карточки: цвет - исход, пустой кружок - ещё не начинался. Имя и
 * состояние - в подсказке; точка с прогоном открывает его. После точки с остановкой - её метка.
 */
export const QueueDots = ({ queue, live }: QueueDotsProps) => {
  const { t } = useTranslation()
  const openRun = useOpenRun(queue.id)

  const stateWord = (item: QueueItem): string =>
    item.state === 'waiting'
      ? t('scenarios.common.stepStates.waiting')
      : item.state === 'running'
        ? t(`scenarios.common.states.${live?.state ?? 'starting'}`)
        : t(`scenarios.common.states.${item.state}`)

  return (
    <ol className={styles.dots} aria-label={t('scenarios.queues.items.label')}>
      {queue.items.map((item, index) => {
        const isMarked = queue.stopAfterItemId === item.id
        const label = t(
          isMarked ? 'scenarios.queues.items.dotStop' : 'scenarios.queues.items.dot',
          {
            number: index + 1,
            name: item.scenarioName,
            state: stateWord(item),
          },
        )
        const dot = clsx(styles.dot, styles[itemDotTone(item, live)])

        return (
          <li key={item.id} className={styles.dotPlace}>
            <Tooltip label={label}>
              {item.runId ? (
                <button
                  type="button"
                  className={clsx(dot, styles.dotButton)}
                  aria-label={label}
                  onClick={() => openRun(item.runId)}
                />
              ) : (
                <span className={dot} role="img" aria-label={label} />
              )}
            </Tooltip>
            {isMarked && <OctagonPause className={styles.mark} size={MARK_ICON_SIZE} aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}
