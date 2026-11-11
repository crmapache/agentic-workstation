import { useState } from 'react'
import { X, Blocks, Palette } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import { useShowcaseStore } from '../showcase.store'
import { ComponentsView } from '../ComponentsView/ComponentsView'
import { FoundationsView } from '../FoundationsView/FoundationsView'
import styles from './Showcase.module.scss'
import type { ShowcaseTab } from './Showcase.types'

/**
 * Витрина дизайн-системы: все токены и компоненты на одном экране, поверх панелей
 * окна. Есть только в dev и в копии окна агента (workbench/views/showcase-view.ts).
 */
export const Showcase = () => {
  const { t } = useTranslation('showcase')
  const [tab, setTab] = useState<ShowcaseTab>('foundations')
  const close = useShowcaseStore((state) => state.close)

  const tabs = [
    { id: 'foundations', label: t('tabs.foundations'), icon: Palette },
    { id: 'components', label: t('tabs.components'), icon: Blocks },
  ] as const

  return (
    <div role="region" aria-label={t('title')} className={styles.showcase}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.heading}>
            <h1 className={styles.title}>{t('title')}</h1>
            <p className={styles.subtitle}>{t('subtitle')}</p>
          </div>
          <div className={styles.actions}>
            <Tabs label={t('tabsLabel')} items={tabs} value={tab} onChange={setTab} />
            <IconButton icon={X} label={t('close')} onClick={close} />
          </div>
        </header>
        {tab === 'foundations' ? <FoundationsView /> : <ComponentsView />}
      </div>
    </div>
  )
}
