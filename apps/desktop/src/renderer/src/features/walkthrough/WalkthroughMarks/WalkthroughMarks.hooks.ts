import { useRef, useState, useEffect } from 'react'
import type { MouseEvent, PointerEvent } from 'react'

import type {
  MarkPoint,
  WalkthroughLit,
  WalkthroughPen,
  WalkthroughMarksView,
} from '@shared/walkthrough'
import { STROKE_POINTS_MAX } from '@shared/walkthrough'

import { invoke } from '../../../lib/ipc'
import { useIpcEvent } from '../../../lib/ipc.hooks'
import { nextPoints } from './WalkthroughMarks.utils'

/** Пометка, которую человек ведёт сейчас. */
type Drawing = { pen: WalkthroughPen; points: MarkPoint[] }

const NOTHING: WalkthroughMarksView = { width: 0, height: 0, lit: [], strokes: [], pen: null }

/**
 * Что рисует окно меток (ADR 0134, 0135): спросить у главного процесса, когда страница открылась,
 * и дальше брать каждую перемену. Окно меток - отдельная страница без кэша запросов, как стрелка
 * ИИ: данные живут в главном процессе, здесь - только то, что нарисовать сейчас.
 */
export const useMarksView = (): WalkthroughMarksView => {
  const [view, setView] = useState(NOTHING)

  useIpcEvent('walkthrough:marks', setView)

  useEffect(() => {
    let isLive = true

    void invoke('walkthrough:view').then((current) => {
      if (isLive) setView((shown) => (shown === NOTHING ? current : shown))
    })

    return () => {
      isLive = false
    }
  }, [])

  return view
}

/**
 * Подсветка уходит плавно: подсветок не стало - последние остаются на месте и гаснут (leaving),
 * пока главный процесс не спрячет окно. Новая - снова проступает из того же затемнения.
 */
export const useFadingLit = (
  lit: WalkthroughLit[],
): { lit: WalkthroughLit[]; leaving: boolean } => {
  const [last, setLast] = useState(lit)

  if (lit.length > 0 && last !== lit) setLast(lit)

  return lit.length > 0 ? { lit, leaving: false } : { lit: last, leaving: last.length > 0 }
}

/**
 * Рисунок пометки инструментом в руке человека: нажал - ведёт, отпустил - пометка уходит главному
 * процессу (точки окна). Обводка - путь руки, подчёркивание и стрелка - начало и конец. Правая
 * кнопка - отложить инструмент: клавиатуры у окна без фокуса нет, Escape не дойдёт.
 */
export const usePenDrawing = (pen: WalkthroughPen | null) => {
  const [live, setLive] = useState<Drawing | null>(null)
  const drawing = useRef<Drawing | null>(null)

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!pen) return

    if (event.button === 2) {
      void invoke('walkthrough:pick', { pen: null })

      return
    }

    if (event.button !== 0) return

    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = { pen, points: [{ x: event.clientX, y: event.clientY }] }
    setLive(drawing.current)
  }

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const current = drawing.current

    if (!current || current.points.length >= STROKE_POINTS_MAX) return

    const point = { x: event.clientX, y: event.clientY }

    drawing.current = {
      pen: current.pen,
      points: nextPoints(current.points, point, current.pen !== 'outline'),
    }
    setLive(drawing.current)
  }

  const handlePointerUp = () => {
    const current = drawing.current

    drawing.current = null
    setLive(null)

    // Инструмент отложили посреди рисунка (панель, главный процесс) - пометки нет.
    if (current?.pen === pen && current.points.length >= 2) {
      void invoke('walkthrough:stroke', { pen: current.pen, points: current.points })
    }
  }

  // Своего меню у окна меток нет: правая кнопка только откладывает инструмент.
  const handleContextMenu = (event: MouseEvent) => event.preventDefault()

  return {
    live: live?.pen === pen ? live : null,
    handlers: pen
      ? {
          onPointerDown: handlePointerDown,
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp,
          onPointerCancel: handlePointerUp,
          onContextMenu: handleContextMenu,
        }
      : {},
  }
}
