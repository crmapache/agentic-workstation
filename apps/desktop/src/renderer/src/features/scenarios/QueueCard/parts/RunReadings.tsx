import { useTranslation } from 'react-i18next'

import { useClock } from '../QueueCard.hooks'
import type { RunReadingsProps } from '../QueueCard.types'
import { formatCost, formatTokens } from '../../scenarios-format.utils'
import { waitClock } from '../../scenarios-forms.utils'
import { runWorked } from '../../scenarios-timeline.utils'
import { CLOCK_TICK_MS } from '../../scenarios.constants'
import { ScenarioReadings } from '../../ScenarioReadings/ScenarioReadings'

/**
 * Показания идущего прогона: сколько он на самом деле работал (пауза и вопрос человеку часы не
 * двигают - на них они и не тикают), токены и деньги, как только появились.
 */
export const RunReadings = ({ live }: RunReadingsProps) => {
  const { t } = useTranslation()
  const now = useClock(live.state === 'running' || live.state === 'starting', CLOCK_TICK_MS)

  const worked = {
    key: 'worked',
    label: t('scenarios.queues.running.worked'),
    value: waitClock(runWorked(live, now)),
  }
  const tokens = {
    key: 'tokens',
    label: t('scenarios.queues.running.tokens'),
    value: formatTokens(live.tokens),
  }
  const cost = {
    key: 'cost',
    label: t('scenarios.queues.running.cost'),
    value: formatCost(live.cost),
  }

  return (
    <ScenarioReadings
      readings={[worked, ...(live.tokens > 0 ? [tokens] : []), ...(live.cost > 0 ? [cost] : [])]}
    />
  )
}
