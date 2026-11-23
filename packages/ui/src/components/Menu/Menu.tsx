import type { KeyboardEvent } from 'react'
import { useRef, useEffect } from 'react'

import {
  ITEM_SELECTOR,
  NAVIGATION_KEYS,
  AUTOFOCUS_SELECTOR,
  CURRENT_ITEM_SELECTOR,
} from './Menu.constants'
import styles from './Menu.module.scss'
import type { MenuProps } from './Menu.types'
import { ownItems, nextIndex, isOwnEvent } from './Menu.utils'

/**
 * Меню внутри всплывающей панели: секции, пункты, поле поиска. Стрелки ходят по
 * пунктам (из поля поиска - на первый), Home и End - в начало и конец, Enter
 * выбирает. Пункты - MenuItem, группы - MenuSection, линии - MenuSeparator, меню сбоку -
 * MenuSubmenu.
 */
export const Menu = ({ label, autoFocus = false, header, children }: MenuProps) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!autoFocus) return

    const menu = ref.current
    const target = menu
      ? (menu.querySelector<HTMLElement>(AUTOFOCUS_SELECTOR) ??
        ownItems(menu, CURRENT_ITEM_SELECTOR)[0] ??
        ownItems(menu, ITEM_SELECTOR)[0])
      : undefined

    target?.focus()
  }, [autoFocus])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Стрелки вложенного меню сбоку (MenuSubmenu) - его, а не этого: оно стоит внутри.
    if (!NAVIGATION_KEYS.has(event.key) || !isOwnEvent(event)) return

    const items = ownItems(event.currentTarget, ITEM_SELECTOR)
    const current = items.indexOf(document.activeElement as HTMLElement)
    const target = nextIndex(event.key, current, items.length)

    if (target === null) return

    event.preventDefault()
    items[target]?.focus()
  }

  return (
    <div ref={ref} role="menu" aria-label={label} className={styles.menu} onKeyDown={handleKeyDown}>
      {header && <div className={styles.header}>{header}</div>}
      {children}
    </div>
  )
}
