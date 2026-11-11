import type { KeyboardEvent } from 'react'
import clsx from 'clsx'

import { Tooltip } from '../Tooltip/Tooltip'
import { TAB_SELECTOR, TAB_ICON_SIZE, TAB_ICON_STROKE_WIDTH } from './Tabs.constants'
import styles from './Tabs.module.scss'
import type { TabsProps } from './Tabs.types'
import { nextTabIndex } from './Tabs.utils'

/**
 * Ряд вкладок-разделов: переключает содержимое одной зоны (разделы витрины); столбцом
 * (vertical) - меню разделов сбоку окна настроек. Стрелки ходят по кругу и сразу выбирают, в ряд по Tab
 * попадает только выбранная. Вкладки проектов в шапке - своя фича, не эта.
 * Со счётчиком - разделы найденного (окно поиска по разговорам). Вкладки делят ряд
 * поровну, растянут ли он раскладкой или fill (режим на всю ширину над тем, что он меняет).
 */
export const Tabs = <TabId extends string>({
  label,
  items,
  value,
  onChange,
  fill = false,
  orientation = 'horizontal',
}: TabsProps<TabId>) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex((item) => item.id === value)
    const target = nextTabIndex(event.key, current, items.length, orientation)
    const item = target === null ? undefined : items[target]

    if (target === null || !item) return

    event.preventDefault()
    onChange(item.id)
    event.currentTarget.querySelectorAll<HTMLElement>(TAB_SELECTOR)[target]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation={orientation}
      className={clsx(styles.tabs, fill && styles.fill, styles[orientation])}
      onKeyDown={handleKeyDown}>
      {items.map(({ id, label: itemLabel, icon: Icon, count, flash, hint }) => {
        const isActive = id === value
        const tab = (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            className={clsx(styles.tab, isActive && styles.active)}
            onClick={() => onChange(id)}>
            {Icon && <Icon size={TAB_ICON_SIZE} strokeWidth={TAB_ICON_STROKE_WIDTH} aria-hidden />}
            {itemLabel}
            {count !== undefined && (
              // Ключ - номер вспышки: новый рост посреди вспышки начинает её заново.
              <span
                key={flash ?? 0}
                className={clsx(styles.count, count > 0 && styles.countLive, flash && styles.grew)}>
                {count}
              </span>
            )}
          </button>
        )

        return hint ? (
          <Tooltip key={id} label={hint}>
            {tab}
          </Tooltip>
        ) : (
          tab
        )
      })}
    </div>
  )
}
