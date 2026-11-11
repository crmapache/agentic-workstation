import { useTranslation } from 'react-i18next'

import { Card } from '@agentic-workstation/ui/Card'
import { Section } from '@agentic-workstation/ui/Section'
import { ShareBar } from '@agentic-workstation/ui/ShareBar'

import styles from '../StatisticsView.module.scss'
import type { SectionProps } from '../StatisticsView.types'
import { formatCount } from '../../statistics-format.utils'
import { AGENTS_TONE, DENIED_TONE, ALLOWED_TONE } from '../../statistics.constants'
import { FactGrid } from './FactGrid'
import { RankedList } from './RankedList'
import { StatisticsHelp } from './StatisticsHelp'

/**
 * Инструменты: частые вызовы агентов, коннекторы (MCP) по серверу и вопросы разрешений в
 * IDE - сколько спрошено, разрешено и отказано. Три карточки рядом, узкая середина - одна под
 * другой.
 */
export const ToolsSection = ({ data }: Pick<SectionProps, 'data'>) => {
  const { t } = useTranslation()
  const { tools, servers, totals } = data.report
  const { asked, allowed, denied } = totals.permissions
  const calls = (count: number) => t('statistics.tools.calls', { count })

  return (
    <Section title={t('statistics.tools.title')} help={<StatisticsHelp topic="tools" />}>
      <div className={styles.columns}>
        <RankedList
          title={t('statistics.tools.top')}
          emptyLabel={t('statistics.nothing')}
          rows={tools.map((row) => ({
            key: row.tool,
            label: row.tool,
            value: calls(row.calls),
            parts: [{ key: 'calls', value: row.calls, tone: AGENTS_TONE }],
          }))}
        />
        <RankedList
          title={t('statistics.tools.servers')}
          emptyLabel={t('statistics.nothing')}
          rows={servers.map((row) => ({
            key: row.server,
            label: row.server,
            value: calls(row.calls),
            parts: [{ key: 'calls', value: row.calls, tone: AGENTS_TONE }],
          }))}
        />
        <Card title={t('statistics.tools.permissions')}>
          {asked === 0 ? (
            <p className={styles.note}>{t('statistics.nothing')}</p>
          ) : (
            <div className={styles.stack}>
              <FactGrid
                facts={[
                  { key: 'asked', label: t('statistics.tools.asked'), value: formatCount(asked) },
                  {
                    key: 'allowed',
                    label: t('statistics.tools.allowed'),
                    value: formatCount(allowed),
                  },
                  {
                    key: 'denied',
                    label: t('statistics.tools.denied'),
                    value: formatCount(denied),
                  },
                ]}
              />
              <ShareBar
                label={t('statistics.tools.permissionsLabel', {
                  allowed: formatCount(allowed),
                  denied: formatCount(denied),
                })}
                segments={[
                  {
                    key: 'allowed',
                    label: t('statistics.tools.allowed'),
                    value: allowed,
                    tone: ALLOWED_TONE,
                  },
                  {
                    key: 'denied',
                    label: t('statistics.tools.denied'),
                    value: denied,
                    tone: DENIED_TONE,
                  },
                ]}
              />
            </div>
          )}
        </Card>
      </div>
    </Section>
  )
}
