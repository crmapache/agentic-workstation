import { useState } from 'react'
import { ChartColumn } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { PageHeader } from '@agentic-workstation/ui/PageHeader'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import styles from '../ComponentsView.module.scss'
import type { SampleTabId, SampleScopeId } from '../ComponentsView.types'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Шапка вида с нижним рядом (toolbar): вкладки слева, фильтр справа - под линией, а полоса
 * шапки ростом с полосу вкладок, как без ряда. Сузь окно - части встают одна под другой.
 */
export const PageToolbarSpecimen = () => {
  const { t } = useTranslation('showcase')
  const [tab, setTab] = useState<SampleTabId>('overview')
  const [scope, setScope] = useState<SampleScopeId>('all')

  return (
    <Specimen label={t('specimens.pageToolbar')} wide layout="column">
      <div className={styles.pageBox}>
        <PageHeader
          icon={ChartColumn}
          title={t('samples.pageToolbarTitle')}
          help={
            <HelpButton
              label={t('samples.help')}
              title={t('samples.pageToolbarTitle')}
              text={t('samples.pageToolbarHelp')}
              closeLabel={t('samples.close')}
            />
          }
          toolbar={
            <>
              <Tabs
                label={t('samples.tabsLabel')}
                items={[
                  { id: 'overview', label: t('samples.overview') },
                  { id: 'changes', label: t('samples.changes') },
                  { id: 'history', label: t('samples.history') },
                ]}
                value={tab}
                onChange={setTab}
              />
              <Tabs
                label={t('samples.chipsLabel')}
                items={[
                  { id: 'all', label: t('samples.modeAll') },
                  { id: 'only', label: t('samples.modeOnly') },
                ]}
                value={scope}
                onChange={setScope}
              />
            </>
          }
        />
        <div className={styles.pageBody}>
          <p className={styles.sampleText}>{t('samples.sectionCompactBody')}</p>
        </div>
      </div>
    </Specimen>
  )
}
