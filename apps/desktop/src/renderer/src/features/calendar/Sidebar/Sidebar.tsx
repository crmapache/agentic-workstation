import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { ResizeHandle } from '@agentic-workstation/ui/ResizeHandle'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import { useCalendarStore } from '../calendar.store'
import type { SidebarTab } from '../calendar.types'
import { OverlapsPanel } from '../OverlapsPanel/OverlapsPanel'
import { SourcesPanel } from '../SourcesPanel/SourcesPanel'
import styles from './Sidebar.module.scss'
import type { SidebarProps } from './Sidebar.types'

/**
 * Боковая панель календаря во всю высоту вида: вкладки «источники» и «накладки» (со счётом
 * непросмотренных), ширину тянут ручкой у правого края в разумных пределах.
 */
export const Sidebar = ({ state }: SidebarProps) => {
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
    const width = panel.current?.offsetWidth

    if (width) setSidebarWidth(width + delta)
  }

  const handleTab = (id: SidebarTab) => showTab(id)

  return (
    <aside ref={panel} className={styles.sidebar} aria-label={t('calendar.sidebar.label')}>
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
