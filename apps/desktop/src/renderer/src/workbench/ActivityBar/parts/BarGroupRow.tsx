import clsx from 'clsx'

import styles from '../ActivityBar.module.scss'
import type { BarGroupRowProps } from '../ActivityBar.types'
import { useTabRowDrag } from '../../../lib/tab-drag.hooks'
import { useBarArrangement, useBarButtonsStore } from '../../../state/bar-buttons.store'
import { shownIds, movedOrder, mergedOrder } from '../../../state/bar-buttons.utils'
import { BarButton } from './BarButton'

/**
 * Группа кнопок полосы - виды сверху или кнопки низа: свой ряд перетаскивания, поэтому кнопка
 * ходит только внутри своей группы и своей полосы. Брошенная встаёт на место, и порядок
 * запоминается (ADR 0112); спрятанных в ряду нет.
 */
export const BarGroupRow = ({ bar, group, buttons, tooltipPlacement }: BarGroupRowProps) => {
  const arrangement = useBarArrangement(bar)
  const arrange = useBarButtonsStore((state) => state.arrange)
  const defaults = buttons.map((button) => button.id)
  const ids = shownIds(defaults, arrangement, group)
  const byId = new Map(buttons.map((button) => [button.id, button]))
  const drag = useTabRowDrag(
    ids,
    (id, beforeId) => {
      const order = movedOrder(mergedOrder(defaults, arrangement.order[group]), ids, id, beforeId)
      const next = { ...arrangement, order: { ...arrangement.order, [group]: order } }

      arrange(bar, group, order)

      return Promise.resolve(shownIds(defaults, next, group))
    },
    'y',
  )

  return (
    <div
      className={clsx(styles.group, group === 'bottom' && styles.bottom)}
      data-tab-row=""
      data-landing={drag.isLanding ? '' : undefined}>
      {ids.map((id) => {
        const button = byId.get(id)

        return (
          button && (
            <BarButton
              key={id}
              button={button}
              tooltipPlacement={tooltipPlacement}
              view={drag.view}
              register={drag.register}
              onPress={drag.onPress}
            />
          )
        )
      })}
    </div>
  )
}
