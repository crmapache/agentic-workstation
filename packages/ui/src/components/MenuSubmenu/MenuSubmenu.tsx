import { useId, useRef, useState, useEffect } from 'react'
import type { ToggleEvent, PointerEvent, KeyboardEvent } from 'react'

import { Menu } from '../Menu/Menu'
import { ITEM_SELECTOR } from '../Menu/Menu.constants'
import { MenuItem } from '../MenuItem/MenuItem'
import { Popover } from '../Popover/Popover'
import { isOwnToggle } from '../Popover/Popover.utils'
import { SUBMENU_BACK_KEYS, SUBMENU_CLOSE_DELAY_MS } from './MenuSubmenu.constants'
import type { MenuSubmenuProps } from './MenuSubmenu.types'

/**
 * Пункт меню со стрелкой и меню сбоку от него, как в меню macOS: открывается наведением, нажатием
 * и стрелкой вправо, закрывается стрелкой влево, Esc и уходом курсора. Меню сбоку - вложенная
 * всплывающая панель: клик по ней не закрывает родительскую, выбор пункта закрывает обе. Для
 * выбора, у которого есть второй шаг (сделать - кем), а не для длинных деревьев.
 */
export const MenuSubmenu = ({
  label,
  icon,
  disabled = false,
  menuLabel,
  children,
}: MenuSubmenuProps) => {
  const id = useId()
  const anchorRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(
    () => () => {
      if (closing.current) clearTimeout(closing.current)
    },
    [],
  )

  const cancelClose = () => {
    if (closing.current) clearTimeout(closing.current)
    closing.current = null
  }

  /** Показать меню сбоку; focus - с клавиатуры и нажатием: фокус встаёт на первый пункт. */
  const show = (focus: boolean) => {
    const popover = popoverRef.current
    const anchor = anchorRef.current

    cancelClose()

    if (!popover || !anchor || disabled) return
    if (!popover.matches(':popover-open')) popover.showPopover({ source: anchor })
    if (focus) popover.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus()
  }

  const hide = () => {
    cancelClose()
    if (popoverRef.current?.matches(':popover-open')) popoverRef.current.hidePopover()
  }

  // Наведение - только мышью: у пальца уход курсора приходит сразу за касанием и закрыл бы меню.
  const handlePointerEnter = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') show(false)
  }
  const handlePointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return

    cancelClose()
    closing.current = setTimeout(hide, SUBMENU_CLOSE_DELAY_MS)
  }
  const handleToggle = (event: ToggleEvent<HTMLDivElement>) => {
    if (isOwnToggle(event)) setIsOpen(event.newState === 'open')
  }
  const handleTriggerKey = (event: KeyboardEvent) => {
    // Стрелка вправо внутри меню сбоку - его клавиша, а не пункта, который его открыл.
    if (event.key !== 'ArrowRight' || popoverRef.current?.contains(event.target as Node)) return

    event.preventDefault()
    show(true)
  }
  const handleMenuKey = (event: KeyboardEvent) => {
    if (!SUBMENU_BACK_KEYS.has(event.key)) return

    // Без preventDefault браузер принял бы Esc за просьбу закрыть и родительскую панель.
    event.preventDefault()
    event.stopPropagation()
    hide()
    anchorRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus()
  }
  const handleMenuClick = () => {
    const parent = anchorRef.current?.closest<HTMLElement>('[popover]')

    // Выбор пункта закрыл меню сбоку - закрыть и то, из которого его открыли.
    if (!popoverRef.current?.matches(':popover-open') && parent?.matches(':popover-open'))
      parent.hidePopover()
  }

  return (
    <div
      ref={anchorRef}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleTriggerKey}>
      <MenuItem
        label={label}
        icon={icon}
        disabled={disabled}
        expanded={isOpen}
        onSelect={() => show(true)}
      />
      <Popover id={id} ref={popoverRef} width="content" placement="side" onToggle={handleToggle}>
        {/* Клавиши и клики пунктов всплывают сюда: Esc, стрелка влево и выбор. */}
        <div onKeyDown={handleMenuKey} onClick={handleMenuClick}>
          <Menu label={menuLabel}>{children}</Menu>
        </div>
      </Popover>
    </div>
  )
}
