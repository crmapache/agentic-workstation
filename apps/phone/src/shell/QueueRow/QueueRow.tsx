import { useTranslation } from 'react-i18next'

import type { QueueWire, RunSummaryWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Badge } from '@agentic-workstation/ui/Badge'

import { ListRow } from '../ListRow/ListRow'
import { queueFacts } from '../../lib/queues.utils'
import { RUN_TONES } from '../../lib/status.constants'

/**
 * Очередь сценариев строкой: имя, папка, идущий прогон и сколько ждёт; справа - что с ней:
 * ждёт человека, идёт, встала. Одна и та же на экране проекта и на доске всех очередей.
 */
export const QueueRow = ({
  queue,
  run,
  onOpen,
}: {
  queue: QueueWire
  run: RunSummaryWire | undefined
  onOpen: () => void
}) => {
  const { t } = useTranslation()

  return (
    <ListRow
      title={queue.name}
      description={queueFacts(t, queue, run)}
      trailing={
        run?.asking ? (
          <Badge tone="accent" variant="soft">
            {t('machines.needsYou')}
          </Badge>
        ) : run ? (
          <Badge tone={RUN_TONES[run.state] ?? 'neutral'}>{t(`runState.${run.state}`)}</Badge>
        ) : queue.hold ? (
          <Badge tone="warning">{t('queue.held')}</Badge>
        ) : undefined
      }
      onClick={onOpen}
    />
  )
}
