import { useTranslation } from 'react-i18next'

import { ShareBar } from '@agentic-workstation/ui/ShareBar'

import styles from '../ComponentsView.module.scss'
import { Specimen } from '../../Specimen/Specimen'

/**
 * Образцы полосы долей: два куска с легендой (крохотная доля не пропадает), три куска с
 * «остальным», строки рейтинга от самой большой (остаток - пустая дорожка) и пустая полоса.
 */
export const ShareBarSpecimens = () => {
  const { t } = useTranslation('showcase')

  return (
    <>
      <Specimen label={t('specimens.shareBar')} layout="column">
        <ShareBar
          label={t('samples.shareCodeLabel')}
          legend
          segments={[
            {
              key: 'you',
              label: t('samples.chartYou'),
              value: 4,
              tone: 'chart1',
              valueLabel: '4%',
            },
            {
              key: 'agents',
              label: t('samples.chartAgents'),
              value: 96,
              tone: 'chart2',
              valueLabel: '96%',
            },
          ]}
        />
        <ShareBar
          label={t('samples.shareCacheLabel')}
          legend
          segments={[
            {
              key: 'read',
              label: t('samples.cacheRead'),
              value: 88,
              tone: 'chart3',
              valueLabel: '88%',
            },
            {
              key: 'write',
              label: t('samples.cacheWrite'),
              value: 9,
              tone: 'chart4',
              valueLabel: '9%',
            },
            {
              key: 'fresh',
              label: t('samples.freshInput'),
              value: 3,
              tone: 'other',
              valueLabel: '3%',
            },
          ]}
        />
      </Specimen>
      <Specimen label={t('specimens.shareBarRanked')} layout="column">
        <div className={styles.stack}>
          <ShareBar
            label={t('samples.shareCodeLabel')}
            total={2400}
            segments={[
              { key: 'you', label: t('samples.chartYou'), value: 120, tone: 'chart1' },
              { key: 'agents', label: t('samples.chartAgents'), value: 2280, tone: 'chart2' },
            ]}
          />
          <ShareBar
            label={t('samples.shareCodeLabel')}
            total={2400}
            segments={[
              { key: 'you', label: t('samples.chartYou'), value: 40, tone: 'chart1' },
              { key: 'agents', label: t('samples.chartAgents'), value: 910, tone: 'chart2' },
            ]}
          />
          <ShareBar
            label={t('samples.shareEmptyLabel')}
            segments={[{ key: 'you', label: t('samples.chartYou'), value: 0, tone: 'chart1' }]}
          />
        </div>
      </Specimen>
    </>
  )
}
