import { useTranslation } from 'react-i18next'

import type { QueueWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Card } from '@agentic-workstation/ui/Card'

import { REST_TICK_MS } from '../QueueScreen.constants'
import styles from '../QueueScreen.module.scss'
import { useNow } from '../../../../lib/now.hooks'
import { momentText } from '../../../../lib/time.utils'

/**
 * Очередь спит вне рабочих часов (ADR 0074 IDE): идущий сценарий на паузе от часов, следующий не
 * стартует - и когда очередь пойдёт сама. Часы ставят и снимают за компьютером; поставленную
 * часами паузу можно снять и отсюда - кнопкой прогона.
 */
export const QueueRest = ({
  nap,
  queue,
  offset,
}: {
  nap: NonNullable<QueueWire['nap']>
  queue: QueueWire
  /** На сколько часы IDE впереди телефона. */
  offset: number
}) => {
  const { t } = useTranslation()
  const now = useNow(REST_TICK_MS)
  const until = nap.until - offset
  // Сценарий на паузе от часов идёт ещё живым; оборванный ночью выходом IDE очередь продолжит
  // утром сама - кнопки Resume для него на этом экране нет.
  const napping = nap.runId ? queue.items.find((item) => item.runId === nap.runId) : undefined
  const text =
    napping?.state === 'running'
      ? t('queue.restPaused', { name: napping.scenarioName })
      : napping?.state === 'stopped'
        ? t('queue.restCut', { name: napping.scenarioName })
        : t('queue.restWaiting')

  // Срок прошёл, а очередь ещё спит: часы IDE будят её в пределах полуминуты.
  return (
    <Card
      title={t('queue.restTitle')}
      description={
        until <= now ? t('queue.restDue') : t('queue.restUntil', { when: momentText(until, now) })
      }>
      <p className={styles.rest}>{text}</p>
    </Card>
  )
}
