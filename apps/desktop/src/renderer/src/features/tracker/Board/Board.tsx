import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cardChip } from '@shared/tracker-link'

import { Button } from '@agentic-workstation/ui/Button'

import { useTrackerActions } from '../tracker.actions'
import { DAY_TICK_MS } from '../tracker.constants'
import { useTrackerStore } from '../tracker.store'
import { neighboursOf } from '../tracker.utils'
import { FlowSection } from '../FlowSection/FlowSection'
import { useNow } from '../../../lib/now.hooks'
import { dropIntoChat } from '../../../state/chat-drop.store'
import type { BoardContextValue } from './Board.context'
import { BoardContext } from './Board.context'
import { useBoardDrag } from './Board.hooks'
import styles from './Board.module.scss'
import type { BoardProps, DragSource } from './Board.types'
import { opOf, cardOf, titleOf, stepPlace } from './Board.utils'
import { DragLayer } from './parts/DragLayer'

/**
 * Доска проекта трекера: потоки сверху вниз, в каждом - группы колонками. Здесь живёт
 * перетаскивание всего, что на доске, и сдвиг на шаг из меню и клавиш: части доски берут их из
 * контекста.
 */
export const Board = ({ project, scroller }: BoardProps) => {
  const { t } = useTranslation()
  const { apply } = useTrackerActions()
  const edit = useTrackerStore((state) => state.edit)
  const now = useNow(true, DAY_TICK_MS)
  const neighbours = useMemo(() => neighboursOf(project), [project])
  const today = new Date(now).setHours(0, 0, 0, 0)
  const { drag, press } = useBoardDrag(neighbours, scroller, (source, drop) => {
    // Карточка в поле чата - тем же чипом, что «Copy link»: заголовок на чипе, модели - ссылка и
    // текст карточки (ADR 0113).
    const card = drop.kind === 'chat' ? cardOf(project, source.id) : null

    if (drop.kind === 'place') void apply(opOf(project.id, source, drop.place))
    else if (card) dropIntoChat(drop.zone, cardChip(card))
  })
  const moveBy = (source: DragSource, delta: -1 | 1) => {
    const place = stepPlace(project, source, delta)

    if (place) void apply(opOf(project.id, source, place))
  }
  const board: BoardContextValue = {
    press,
    draggingId: drag?.source.id ?? null,
    today,
    moveBy,
  }

  return (
    <BoardContext value={board}>
      <div className={styles.board}>
        {project.flows.map((flow) => (
          <FlowSection key={flow.id} flow={flow} projectId={project.id} />
        ))}
        <div className={styles.newFlow}>
          <Button
            variant="dashed"
            icon={Plus}
            onClick={() => edit({ kind: 'flow', id: null, projectId: project.id })}>
            {t('tracker.flow.new')}
          </Button>
        </div>
      </div>
      {drag && <DragLayer drag={drag} title={titleOf(project, drag.source)} />}
    </BoardContext>
  )
}
