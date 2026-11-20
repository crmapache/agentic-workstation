import type { ReactNode } from 'react'

import type { CallLightTone } from '@agentic-workstation/ui/CallLight.types'

import type { ViewDescriptor } from '../views/views.types'

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

export type ActivityBarProps<ViewId extends string> = {
  views: readonly ViewDescriptor<ViewId>[]
  activeViewId: ViewId
  /** Развёрнута ли область полосы: при свёрнутой ни одна иконка не горит. */
  isPanelOpen: boolean
  /** С какой стороны от своей области стоит полоса: подсказка встаёт в сторону области. */
  edge: 'start' | 'end'
  label: string
  /** Кнопки у нижнего края полосы, отдельно от видов: терминал под панелью. */
  footer?: ReactNode | undefined
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
