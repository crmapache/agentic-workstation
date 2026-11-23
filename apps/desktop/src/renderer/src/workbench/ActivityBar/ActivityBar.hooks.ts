import { useState } from 'react'
import type { MouseEvent } from 'react'

import { openWhenReleased } from '@agentic-workstation/ui/Popover.utils'

import type { BarMenuTarget } from './ActivityBar.types'

/**
 * Меню правой кнопки на полосе: на кнопке - спрятать её и галочки всех кнопок полосы, мимо
 * кнопок - только галочки. Встаёт у точки нажатия: якорь там стоит всегда, иначе панель
 * открылась бы на рендер позже меню, и меню не поставило бы фокус на первый пункт.
 */
export const useBarMenu = () => {
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null)
  const [target, setTarget] = useState<BarMenuTarget | null>(null)
  const [openId, setOpenId] = useState<string | null | undefined>(undefined)

  const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()

    const box = event.currentTarget.getBoundingClientRect()
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-bar-button]')
        : null
    const id = button?.dataset.barButton ?? null

    setTarget({ left: event.clientX - box.left, top: event.clientY - box.top, id })
    openWhenReleased(event.nativeEvent, () => setOpenId(id))
  }

  return {
    anchor,
    setAnchor,
    /** Где стоит якорь меню - в координатах полосы. */
    point: target && { left: target.left, top: target.top },
    /** На какой кнопке открыто меню: null - мимо кнопок, undefined - меню закрыто. */
    openId,
    close: () => setOpenId(undefined),
    onContextMenu: handleContextMenu,
  }
}
