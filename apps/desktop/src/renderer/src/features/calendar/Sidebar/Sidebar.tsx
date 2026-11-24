import { useRef } from 'react'
import { clsx } from 'clsx'
import { useTranslation } from 'react-i18next'

import { ResizeHandle } from '@agentic-workstation/ui/ResizeHandle'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import { useCalendarStore } from '../calendar.store'
import type { SidebarTab } from '../calendar.types'
import { roomBesideGrid } from '../CalendarView/CalendarView.utils'
import { OverlapsPanel } from '../OverlapsPanel/OverlapsPanel'
import { SourcesPanel } from '../SourcesPanel/SourcesPanel'
import styles from './Sidebar.module.scss'
import type { SidebarProps } from './Sidebar.types'

/**
 * Боковая панель календаря во всю высоту вида: вкладки «источники» и «накладки» (со счётом
 * непросмотренных), ширину тянут ручкой у правого края в разумных пределах. В узком виде
 * (floating) лежит поверх сетки у левого края, а не теснит её.
 */
export const Sidebar = ({ state, floating }: SidebarProps) => {
  const { t } = useTranslation()
  const tab = useCalendarStore((store) => store.sidebarTab)
  const showTab = useCalendarStore((store) => store.showTab)
  const setSidebarWidth = useCalendarStore((store) => store.setSidebarWidth)
  const panel = useRef<HTMLElement>(null)
  const items = [
    { id: 'sources' as const, label: t('calendar.sidebar.sources') },
    {
      id: 'overlaps' as const,
      label: t('calendar.sidebar.overlaps'),
      count: state.upcomingOverlaps,
    },
  ]

  const handleResize = (delta: number) => {
    const node = panel.current
    const view = node?.parentElement

    if (!node?.offsetWidth || !view) return

    // Рядом с сеткой панель не шире места, которое оставляет сетке её наименьшая ширина: иначе
    // она ушла бы поверх сетки прямо из-под руки. Поверх сетки ей мешать некому.
    const room = floating ? Infinity : roomBesideGrid(view)

    setSidebarWidth(Math.min(node.offsetWidth + delta, room))
  }

  const handleTab = (id: SidebarTab) => showTab(id)

  return (
    <aside
      ref={panel}
      className={clsx(styles.sidebar, floating && styles.floating)}
      aria-label={t('calendar.sidebar.label')}>
      <div className={styles.head}>
        <Tabs
          label={t('calendar.sidebar.label')}
          items={items}
          value={tab}
          fill
          onChange={handleTab}
        />
      </div>
      <div className={styles.content}>
        {tab === 'sources' ? <SourcesPanel state={state} /> : <OverlapsPanel state={state} />}
      </div>
      <ResizeHandle edge="end" label={t('calendar.sidebar.resize')} onResize={handleResize} />
    </aside>
  )
}
