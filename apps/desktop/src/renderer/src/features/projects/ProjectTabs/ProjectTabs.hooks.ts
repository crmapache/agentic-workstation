import type { MouseEvent as ReactMouseEvent } from 'react'
import { useRef, useState, useCallback, useLayoutEffect } from 'react'

import {
  SWAP_GAP_PX,
  GLIDE_WAIT_MS,
  DRAG_THRESHOLD_PX,
  AUTO_SCROLL_EDGE_PX,
  AUTO_SCROLL_MAX_STEP_PX,
} from './ProjectTabs.constants'
import type { TabSlot, MoveProject, TabDragView } from './ProjectTabs.types'
import {
  beforeOf,
  nextPlace,
  shiftsFor,
  clampOffset,
  landingOffset,
  autoScrollStep,
} from './ProjectTabs.utils'

const IDLE: TabDragView = { signature: '', draggedId: null, offset: 0, shifts: {} }

/**
 * Клик, которым браузер закончит жест, - не выбор вкладки: он перехватывается до React. Только
 * он: отпустили не над вкладкой - клика не будет, и перехват не должен съесть следующий.
 */
const swallowEndingClick = () => {
  const swallow = (click: MouseEvent) => {
    click.stopPropagation()
    click.preventDefault()
  }

  window.addEventListener('click', swallow, { capture: true, once: true })
  window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }))
}

/** Сколько вкладка сейчас сдвинута от своего места - у браузера, с учётом идущего перехода. */
const liveShift = (node: HTMLElement): number => {
  const { transform } = getComputedStyle(node)

  return !transform || transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41
}

/**
 * Место вкладки в ряду (координаты ряда, с прокруткой) - с долями пикселя и без сдвига
 * жеста: по нему соседи встанут ровно туда, где их потом нарисует новый порядок.
 */
const slotOf = (id: string, node: HTMLElement, list: HTMLElement): TabSlot => {
  const box = node.getBoundingClientRect()

  return {
    id,
    left: box.left - liveShift(node) - list.getBoundingClientRect().left + list.scrollLeft,
    width: box.width,
  }
}

/** Вкладка доехала до места (конец перехода сдвига) - или перехода не было вовсе. */
const afterGlide = (node: HTMLElement | undefined, then: () => void) => {
  let done = false

  const finish = () => {
    if (done) return

    done = true
    node?.removeEventListener('transitionend', handleEnd)
    window.clearTimeout(timer)
    then()
  }

  const handleEnd = (event: TransitionEvent) => {
    if (event.target === node && event.propertyName === 'transform') finish()
  }

  const timer = window.setTimeout(finish, GLIDE_WAIT_MS)

  node?.addEventListener('transitionend', handleEnd)
}

/**
 * Перетаскивание вкладок проектов в одном ряду: порог 4 пикселя, вкладка едет за рукой в
 * пределах ряда, соседи уступают ей место переходом, у края ряд, который листается, едет сам;
 * Esc - отмена. Отпустили - вкладка доезжает до нового места, и только тогда порядок уходит
 * главному процессу: пришедший порядок рисует вкладки ровно там, где они уже стоят, и кадр
 * его прихода идёт без переходов (data-landing) - ничто не прыгает. Активный проект жест не
 * меняет, и клик, которым кончается жест, вкладку не открывает.
 */
export const useProjectTabDrag = (ids: readonly string[], move: MoveProject) => {
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const latest = useRef({ ids, move })
  const settling = useRef(false)
  const [stored, setView] = useState<TabDragView>(IDLE)
  const signature = ids.join()
  // Картина жеста - только для порядка, в котором он начался. Пришёл другой - кадр без
  // переходов: вкладки уже стоят на новых местах, и сдвиги просто снимаются.
  const view = stored.signature === signature ? stored : IDLE
  const isLanding = stored !== IDLE && stored.signature !== signature

  useLayoutEffect(() => {
    latest.current = { ids, move }
  })

  // Кадр прихода порядка: стиль считается сразу, пока переходы выключены, - иначе браузер
  // сложил бы его со следующим и поехал бы от старых сдвигов. Потом старая картина снимается:
  // вернись ряд к тому же порядку - она бы ожила.
  useLayoutEffect(() => {
    if (!isLanding) return

    nodes.current.forEach((node) => node.getBoundingClientRect())

    const timer = window.setTimeout(() => setView(IDLE))

    return () => window.clearTimeout(timer)
  }, [isLanding])

  const register = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) nodes.current.set(id, node)
    else nodes.current.delete(id)
  }, [])

  /** Снимок ряда в начале жеста: места вкладок по порядку. */
  const snapshot = (list: HTMLElement): TabSlot[] =>
    latest.current.ids.flatMap((id) => {
      const node = nodes.current.get(id)

      return node ? [slotOf(id, node, list)] : []
    })

  /**
   * Отпустили: место не сменилось - всё едет назад. Сменилось - вкладка доезжает до нового
   * места (соседи там уже стоят), потом порядок уходит главному; отказ - ряд едет назад.
   */
  const drop = (slots: readonly TabSlot[], from: number, place: number, order: string) => {
    const id = latest.current.ids[from]

    if (place === from || !id) return setView(IDLE)

    const before = beforeOf(latest.current.ids, from, place)

    settling.current = true
    setView({
      signature: order,
      draggedId: null,
      offset: 0,
      shifts: { ...shiftsFor(slots, from, place), [id]: landingOffset(slots, from, place) },
    })

    const settle = (next: readonly string[] | null) => {
      settling.current = false

      if (!next || next.join() === order) setView(IDLE)
    }

    afterGlide(nodes.current.get(id), () => {
      // Пока ехала, ряд сменился (проект открыли или закрыли) - переставлять уже нечего.
      if (latest.current.ids.join() !== order) return settle(null)

      void latest.current.move(id, before).then(settle, () => settle(null))
    })
  }

  const onPress = (event: ReactMouseEvent<HTMLDivElement>, id: string) => {
    const button = (event.target as HTMLElement).closest('button')
    const list = event.currentTarget.closest<HTMLElement>('[data-tab-row]')
    const order = latest.current.ids.join()

    // Крестик - кнопка, а не ручка; прошлая вкладка ещё доезжает - ждать её.
    if (event.button !== 0 || !list || settling.current) return
    if (button && button.getAttribute('role') !== 'tab') return

    const startX = event.clientX
    const startScroll = list.scrollLeft
    let slots: TabSlot[] | null = null
    let from = -1
    let place = -1
    let pointerX = startX
    let frame = 0
    let isCancelled = false

    const update = () => {
      if (!slots) return

      const dx = pointerX - startX + list.scrollLeft - startScroll
      const offset = clampOffset(slots, from, dx)

      place = nextPlace(slots, from, place, offset, SWAP_GAP_PX)
      setView({ signature: order, draggedId: id, offset, shifts: shiftsFor(slots, from, place) })
    }

    // У края ряд едет сам, пока рука там, даже если она не двигается.
    const scrollTick = () => {
      const box = list.getBoundingClientRect()
      const room = {
        before: list.scrollLeft,
        after: list.scrollWidth - list.clientWidth - list.scrollLeft,
      }
      const step = autoScrollStep(pointerX, box, room, AUTO_SCROLL_EDGE_PX, AUTO_SCROLL_MAX_STEP_PX)

      if (step !== 0) {
        list.scrollLeft += step
        update()
      }

      frame = requestAnimationFrame(scrollTick)
    }

    // Отмена (Esc, ряд сменился) - вкладки едут назад, но жест кончается только с кнопкой мыши:
    // её отпускание - тоже не клик по вкладке.
    const cancel = () => {
      isCancelled = true
      cancelAnimationFrame(frame)
      setView(IDLE)
    }

    const handleMove = (moved: MouseEvent) => {
      pointerX = moved.clientX

      if (isCancelled) return
      // Ряд сменился посреди жеста (проект открыли или закрыли) - снимок уже не про него.
      if (latest.current.ids.join() !== order) return cancel()

      if (!slots) {
        if (Math.abs(pointerX - startX) < DRAG_THRESHOLD_PX) return

        slots = snapshot(list)
        from = slots.findIndex((slot) => slot.id === id)
        place = from

        if (from < 0) return cancel()

        frame = requestAnimationFrame(scrollTick)
      }

      update()
    }

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('keydown', handleKey, true)
      cancelAnimationFrame(frame)

      if (!slots) return

      swallowEndingClick()

      // Ряд мог смениться и без движения руки - тогда места из снимка уже не про него.
      if (isCancelled || latest.current.ids.join() !== order) setView(IDLE)
      else drop(slots, from, place, order)
    }

    const handleKey = (key: KeyboardEvent) => {
      if (key.key !== 'Escape' || !slots || isCancelled) return

      key.preventDefault()
      key.stopPropagation()
      cancel()
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('keydown', handleKey, true)
  }

  return { register, view, isLanding, onPress }
}
