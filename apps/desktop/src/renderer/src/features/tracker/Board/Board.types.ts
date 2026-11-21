import type { RefObject, MouseEvent } from 'react'

import type { TrackerProject } from '@shared/tracker'

/** Что несут: карточку, группу или поток. */
export type DragSource = { kind: 'card' | 'group' | 'flow'; id: string }

/** Куда положат: место в списке своего вида (beforeId - перед ним, null - в конец). */
export type DropPlace =
  | { kind: 'card'; groupId: string; followUpOf: string | null; beforeId: string | null }
  | { kind: 'group'; flowId: string; beforeId: string | null }
  | { kind: 'flow'; beforeId: string | null }

/** Линия места под рукой: горизонтальная (h) или вертикальная (v), в координатах окна. */
export type DropMark = { axis: 'h' | 'v'; x: number; y: number; length: number }

export type Rect = { left: number; top: number; width: number; height: number }

/** То, над чем рука: карточка, конец цепочки, колонка группы, ряд групп, поток. */
export type DropHit =
  | { kind: 'card'; id: string; groupId: string; followUp: boolean; rect: Rect }
  | { kind: 'chain'; rootId: string; groupId: string; rect: Rect }
  | { kind: 'group'; id: string; flowId: string; rect: Rect; head: Rect; end: Rect | null }
  | { kind: 'row'; flowId: string; end: Rect | null }
  | { kind: 'flow'; id: string; rect: Rect }

/** Картина жеста: что несут, где рука, размер и захват призрака, место. */
export type BoardDrag = {
  source: DragSource
  x: number
  y: number
  grab: { dx: number; dy: number; width: number; height: number }
  place: DropPlace | null
  mark: DropMark | null
}

export type BoardDragApi = {
  drag: BoardDrag | null
  /** Нажатие на то, что можно нести: после порога начинается жест. */
  press: (event: MouseEvent<HTMLElement>, source: DragSource) => void
}

export type BoardProps = {
  project: TrackerProject
  /** Страница, которая листается сверху вниз: у её края она едет за рукой сама. */
  scroller: RefObject<HTMLElement | null>
}

export type DragLayerProps = { drag: BoardDrag; title: string }
