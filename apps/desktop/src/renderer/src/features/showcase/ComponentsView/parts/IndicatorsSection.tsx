import { useState } from 'react'
import clsx from 'clsx'
import { Mail, Plug, History, GitCompare, LayoutDashboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '@agentic-workstation/ui/Avatar'
import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { FileIcon } from '@agentic-workstation/ui/FileIcon'
import { IconPlaque } from '@agentic-workstation/ui/IconPlaque'
import { Kbd } from '@agentic-workstation/ui/Kbd'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import {
  KBD_SAMPLES,
  PLAQUE_TONES,
  BADGE_SAMPLES,
  AVATAR_SAMPLES,
  FILE_ICON_SAMPLES,
  FILE_ICON_SMALL_SAMPLES,
} from '../ComponentsView.constants'
import styles from '../ComponentsView.module.scss'
import type { SampleTabId } from '../ComponentsView.types'
import { ShowcaseSection } from '../../ShowcaseSection/ShowcaseSection'
import { Specimen } from '../../Specimen/Specimen'
import { useGrowthFlash } from '../../../../lib/growth-flash.hooks'
import { splitPath } from '../../../../lib/path.utils'

/**
 * Раздел «Индикаторы»: значки проектов, иконки файлов, метки состояния, сочетания
 * клавиш, вкладки.
 */
export const IndicatorsSection = () => {
  const { t } = useTranslation('showcase')
  const [tab, setTab] = useState<SampleTabId>('overview')
  const [historyCount, setHistoryCount] = useState(3)
  const historyFlash = useGrowthFlash(historyCount)

  const tabs = [
    { id: 'overview', label: t('samples.overview'), icon: LayoutDashboard },
    { id: 'changes', label: t('samples.changes'), icon: GitCompare },
    { id: 'history', label: t('samples.history'), icon: History },
  ] as const
  // Разделы найденного: счётчик с нуля (тусклый) и с находкой, подсказка - клавиша раздела.
  // Счётчик, выросший от кнопки рядом, вспыхивает (flash).
  const countedTabs = [
    { id: 'overview', label: t('samples.overview'), count: 12, hint: '⌥⌘1' },
    { id: 'changes', label: t('samples.changes'), count: 0, hint: '⌥⌘2' },
    {
      id: 'history',
      label: t('samples.history'),
      count: historyCount,
      flash: historyFlash,
      hint: '⌥⌘3',
    },
  ] as const

  const handleGrow = () => setHistoryCount((count) => count + 1)

  return (
    <ShowcaseSection title={t('sections.indicators')}>
      <Specimen label={t('specimens.avatars')}>
        {AVATAR_SAMPLES.map(({ tone, initials }) => (
          <Avatar key={tone} tone={tone} initials={initials} />
        ))}
      </Specimen>

      <Specimen wide label={t('specimens.fileIcons')}>
        {FILE_ICON_SAMPLES.map(({ path, kind, expanded }) => (
          <span key={`${kind}:${path}:${String(expanded)}`} className={styles.fileIconSample}>
            <FileIcon path={path} kind={kind} expanded={expanded} />
            {splitPath(path).name}
          </span>
        ))}
      </Specimen>

      <Specimen wide label={t('specimens.fileIconsSmall')}>
        {FILE_ICON_SMALL_SAMPLES.map((path) => (
          <span key={path} className={clsx(styles.fileIconSample, styles.small)}>
            <FileIcon path={path} kind="file" size="sm" />
            {splitPath(path).name}
          </span>
        ))}
      </Specimen>

      <Specimen label={t('specimens.badgeMarkers')}>
        {BADGE_SAMPLES.map(({ tone, labelKey }) => (
          <Badge key={tone} tone={tone}>
            {t(labelKey)}
          </Badge>
        ))}
      </Specimen>

      <Specimen label={t('specimens.badgeSoft')}>
        {BADGE_SAMPLES.map(({ tone, labelKey }) => (
          <Badge key={tone} tone={tone} variant="soft">
            {t(labelKey)}
          </Badge>
        ))}
      </Specimen>

      <Specimen label={t('specimens.iconPlaque')}>
        {PLAQUE_TONES.map((tone) => (
          <IconPlaque key={tone} icon={Mail} tone={tone} />
        ))}
        <IconPlaque icon={Mail} tone="danger" muted />
        <IconPlaque icon={Plug} tone="accent" size="lg" />
      </Specimen>

      <Specimen label={t('specimens.kbd')}>
        {KBD_SAMPLES.map((keys) => (
          <Kbd key={keys.join('+')} keys={keys} />
        ))}
      </Specimen>

      <Specimen label={t('specimens.tabs')}>
        <Tabs label={t('samples.tabsLabel')} items={tabs} value={tab} onChange={setTab} />
        <Tabs label={t('samples.tabsLabel')} items={countedTabs} value={tab} onChange={setTab} />
        <Button size="sm" variant="ghost" onClick={handleGrow}>
          {t('samples.countGrow')}
        </Button>
      </Specimen>

      <Specimen label={t('specimens.tabsFill')} layout="column">
        <Tabs label={t('samples.tabsLabel')} items={tabs} value={tab} onChange={setTab} fill />
      </Specimen>

      <Specimen label={t('specimens.tabsVertical')}>
        <div className={styles.tabColumn}>
          <Tabs
            label={t('samples.tabsLabel')}
            items={tabs}
            value={tab}
            orientation="vertical"
            onChange={setTab}
          />
        </div>
      </Specimen>
    </ShowcaseSection>
  )
}
