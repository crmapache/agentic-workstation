import type { MouseEvent } from 'react'

import type { Conversation } from '@shared/claude'
import type { Project } from '@shared/workspace'

import type { TabCall } from '../claude.types'

export type ConversationTabsProps = {
  project: Project
  /** Разговоры проекта в порядке полосы: группа форков - подряд. */
  conversations: readonly Conversation[]
  activeId: string | null
}

/** Вкладка полосы, как её видит перетаскивание: id и группа. */
export type StripTab = Pick<Conversation, 'id' | 'groupId'>

/** Что делает жест: несёт группу целиком или форк внутри своей группы. */
export type DragKind = 'group' | 'tab'

export type Drag = {
  kind: DragKind
  /** id группы или вкладки - что несёт жест. */
  id: string
  /** Группа, в которой идёт жест; у жеста группы - она же. */
  groupId: string
}

/** Сдвиг в пикселях полосы. */
export type Point = { x: number; y: number }

/**
 * Вкладка, как её измерила полоса: где стоит и к какой единице жеста относится
 * (undefined - вне жеста: чужие вкладки, когда форк ходит внутри своей группы).
 */
export type TabRect = {
  key: string
  unit: string | undefined
  left: number
  right: number
  top: number
}

/** Отрезок одной единицы на одном ряду: группа, перенесённая на два ряда, - две коробки. */
export type Box = { index: number; line: number; left: number; right: number }

export type Shot = {
  /** Единицы в порядке полосы: группы целиком или вкладки одной группы. */
  units: string[]
  /** Верхи рядов, на которых стоят единицы жеста, сверху вниз. */
  lines: number[]
  boxes: Box[]
}

/** Что полоса показывает на время жеста: кого несут, сдвиги соседей, рост полосы. */
export type DragView = {
  drag: Drag | null
  offset: Point
  shifts: Record<string, Point>
  /** Высота полосы на время жеста, если отпускание добавит ряд; null - как есть. */
  reach: number | null
}

export type ConversationTabProps = {
  conversation: Conversation
  isActive: boolean
  /** Первая вкладка группы: ручка всей группы. */
  startsGroup: boolean
  /** Последняя вкладка группы, за которой идёт другая: за ней зазор до соседней группы. */
  endsGroup: boolean
  /** Сколько вкладок в группе: в группе из двух форк тащит всю группу. */
  groupSize: number
  /** Сколько вкладок у проекта: последнюю пустую не закрывают. */
  tabCount: number
  /** Зов вкладки: повод красит свет, момент задаёт его фазу. */
  call: TabCall | null
  calm: boolean
  dragView: DragView
  register: (id: string, node: HTMLDivElement | null) => void
  /** Нажатие на вкладку: начало жеста перетаскивания (gripId - вкладка под рукой). */
  onPress: (event: MouseEvent<HTMLDivElement>, drag: Drag, gripId: string) => void
  onMenu: (conversationId: string, anchor: HTMLElement) => void
  /** Хвост перетаскивания - не выбор вкладки: клик после жеста гасится. */
  wasDragged: () => boolean
}

export type TabNameFieldProps = {
  title: string
  label: string
  /** Набранное имя или null - отменили; byKey - Enter или Esc, а не уход фокуса. */
  onDone: (name: string | null, byKey: boolean) => void
}

export type TabContextMenuProps = {
  conversation: Conversation | null
  anchor: HTMLElement | null
  onClose: () => void
}
