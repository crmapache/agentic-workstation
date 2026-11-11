import { useTranslation } from 'react-i18next'

import type { QueueWire, QueueItemWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Badge } from '@agentic-workstation/ui/Badge'
import { Section } from '@agentic-workstation/ui/Section'

import type { useQueueScreen } from '../QueueScreen.hooks'
import styles from '../QueueScreen.module.scss'
import { itemFacts } from '../QueueScreen.utils'
import type { RouteOf } from '../../../../lib/route.types'
import { useRouter } from '../../../../lib/router.store'
import { QUEUE_ITEM_TONES } from '../../../../lib/status.constants'
import { ListGroup } from '../../../../shell/ListGroup/ListGroup'
import { ListRow } from '../../../../shell/ListRow/ListRow'
import { WaitingItemCard } from './WaitingItemCard'

/**
 * Элементы очереди по порядку. Прошедшие и идущий - строками: нажатие открывает их прогон.
 * Ждущие - карточками со своими кнопками: переставить, убрать, остановиться после них.
 */
export const QueueItems = ({
  route,
  queue,
  screen,
}: {
  route: RouteOf<'queue'>
  queue: QueueWire
  screen: ReturnType<typeof useQueueScreen>
}) => {
  const { t } = useTranslation()
  const navigate = useRouter((state) => state.navigate)
  const passed = queue.items.filter((item) => item.state !== 'waiting')
  const waiting = queue.items.filter((item) => item.state === 'waiting')

  const openRun = (item: QueueItemWire) => () =>
    navigate({
      name: 'run',
      agentId: route.agentId,
      projectKey: route.projectKey,
      runId: item.runId,
    })

  return (
    <Section size="sm" title={t('queue.items')} count={queue.items.length}>
      <div className={styles.items}>
        {passed.length > 0 && (
          <ListGroup label={t('queue.items')}>
            {passed.map((item) => (
              <ListRow
                key={item.id}
                title={item.scenarioName}
                description={itemFacts(t, item) || undefined}
                trailing={
                  <>
                    {queue.stopAfterItemId === item.id && (
                      <Badge tone="warning">{t('queue.stopsHere')}</Badge>
                    )}
                    <Badge tone={QUEUE_ITEM_TONES[item.state] ?? 'neutral'}>
                      {t(`itemState.${item.state}`)}
                    </Badge>
                  </>
                }
                onClick={item.runId ? openRun(item) : undefined}
              />
            ))}
          </ListGroup>
        )}
        {waiting.map((item, position) => (
          <WaitingItemCard
            key={item.id}
            queue={queue}
            item={item}
            position={position}
            waitingCount={waiting.length}
            screen={screen}
          />
        ))}
      </div>
    </Section>
  )
}
