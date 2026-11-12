import { LocateFixed, ChevronsDownUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { PageHeader } from '@agentic-workstation/ui/PageHeader'

import styles from '../ComponentsView.module.scss'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Шапка вида боковой панели (PageHeader sm): заголовок подписью панели и ряд кнопок, как у
 * дерева файлов. Полоса той же высоты, что у шапки середины окна.
 */
export const PanelHeaderSpecimen = () => {
  const { t } = useTranslation('showcase')

  return (
    <Specimen label={t('specimens.panelHeader')} layout="column">
      <div className={styles.pageBox}>
        <PageHeader
          size="sm"
          title={t('samples.panelHeaderTitle')}
          actions={
            <>
              <IconButton icon={LocateFixed} size="sm" label={t('samples.panelHeaderLocate')} />
              <IconButton
                icon={ChevronsDownUp}
                size="sm"
                label={t('samples.panelHeaderCollapse')}
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
