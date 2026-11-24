import type { MouseEvent } from 'react'
import type { LucideIcon } from 'lucide-react'

import type { ActivityBarId } from '@shared/window'

import type { CallLightTone } from '@agentic-workstation/ui/CallLight.types'
import type { TooltipPlacement } from '@agentic-workstation/ui/Tooltip.types'

import type { ViewDescriptor } from '../views/views.types'
import type { TabDragView } from '../../lib/tab-drag.types'
import type { BarGroup } from '../../state/bar-buttons.types'

/**
 * Точка на углу иконки - у вида есть что-то, о чём стоит знать, но ничего не ждёт человека
 * (изменения в проекте). tone - цвет точки, label - имя вида вместе со смыслом точки:
 * подсказка и то, что слышит читалка экрана.
 */
export type ActivityMark = { tone: ActivityMarkTone; label: string }

/** Тон точки - язык цветов git в дереве (ADR 0017): изменено или конфликт. */
export type ActivityMarkTone = 'modified' | 'conflict'

/**
 * Свет на иконке вида: там кто-то позвал человека (разговор провайдера закончил ход, спросил,
 * упал). tone - повод последнего зова, at - его момент (фаза света), label - имя вида и
 * строки позвавших: подсказка и то, что слышит читалка экрана.
 */
export type ActivityCall = { tone: CallLightTone; at: number; label: string }

/**
 * Кнопка низа полосы - не вид, а действие со своим состоянием: статистика и настройки, терминал.
 * name - имя в меню с галочками, hint - подсказка, если в ней больше имени (сочетание клавиш).
 */
export type BarAction = {
  id: string
  icon: LucideIcon
  name: string
  hint?: string | undefined
  active: boolean
  onClick: () => void
}

/**
 * Кнопка полосы, как её рисует BarButton: вид сверху и действие снизу - одной формой. label -
 * подсказка и имя для читалки, name - имя в меню; count, mark и call - только у видов.
 */
export type BarButtonModel = {
  id: string
  icon: LucideIcon
  name: string
  label: string
  active: boolean
  count: number
  mark?: ActivityMark | undefined
  /** null - свет гаснет; не задано - у полосы света не бывает. */
  call?: CallLightTone | null | undefined
  callSince?: number | undefined
  onClick: () => void
}

/** Кнопки полосы по группам: частые виды сверху, редкие виды и действия - прижатые к низу. */
export type BarButtonGroups = Record<BarGroup, BarButtonModel[]>

export type ActivityBarProps<ViewId extends string> = {
  /** Какая это полоса: у каждой свой порядок кнопок и свои спрятанные (ADR 0112). */
  bar: ActivityBarId
  views: readonly ViewDescriptor<ViewId>[]
  activeViewId: ViewId
  /** Развёрнута ли область полосы: при свёрнутой ни одна иконка не горит. */
  isPanelOpen: boolean
  /** С какой стороны от своей области стоит полоса: подсказка встаёт в сторону области. */
  edge: 'start' | 'end'
  label: string
  /** Кнопки у нижнего края полосы, под видами группы bottom: терминал под панелью. */
  footer?: readonly BarAction[] | undefined
  /**
   * Число на иконке вида - то, что ждёт человека (прогоны сценариев с вопросом). Ноль и
   * отсутствие - без значка: иконка не должна мигать пустым кругом.
   */
  badges?: Partial<Record<ViewId, number>> | undefined
  /** Точка на иконке вида, когда числа нет: что-то изменилось, но ничего не ждёт ответа. */
  marks?: Partial<Record<ViewId, ActivityMark>> | undefined
  /**
   * Свет на иконке вида, где кто-то позвал человека. Показанный вид не горит: свет тогда - на
   * его собственных вкладках. Нет пропа - у полосы света не бывает.
   */
  calls?: Partial<Record<ViewId, ActivityCall>> | undefined
  onSelect: (viewId: ViewId) => void
}

export type BarGroupRowProps = {
  bar: ActivityBarId
  group: BarGroup
  buttons: readonly BarButtonModel[]
  tooltipPlacement: TooltipPlacement
}

export type BarButtonProps = {
  button: BarButtonModel
  tooltipPlacement: TooltipPlacement
  /** Картина жеста группы: несут ли эту кнопку и на сколько она сдвинута. */
  view: TabDragView
  register: (id: string, node: HTMLDivElement | null) => void
  onPress: (event: MouseEvent<HTMLDivElement>, id: string) => void
}

/** Меню правой кнопки: где нажали (координаты полосы) и на какой кнопке; null - мимо кнопок. */
export type BarMenuTarget = { left: number; top: number; id: string | null }

export type BarMenuProps = {
  bar: ActivityBarId
  label: string
  groups: BarButtonGroups
  targetId: string | null
  anchor: HTMLElement
  onClose: () => void
}
