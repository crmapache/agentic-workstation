import { Code2, Coins, Timer, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Section } from '@agentic-workstation/ui/Section'
import { ShareBar } from '@agentic-workstation/ui/ShareBar'

import styles from '../StatisticsView.module.scss'
import type { SectionProps } from '../StatisticsView.types'
import {
  shareOf,
  formatCost,
  formatCount,
  formatPercent,
  formatDuration,
} from '../../statistics-format.utils'
import { linesOf, tokensOf } from '../../statistics-totals.utils'
import { YOU_TONE, MINUTE_MS, AGENTS_TONE } from '../../statistics.constants'
import { OverviewTile } from './OverviewTile'
import { StatisticsHelp } from './StatisticsHelp'

/**
 * Четыре плитки сводки: код (ты и агенты), время агентов, твоё присутствие, токены и цена.
 * Каждое число - со сравнением с тем же отрезком прошлого периода, где оно честное:
 * человеческие числа копятся позже агентских и сравниваются отдельно.
 */
export const OverviewSection = ({ data }: Pick<SectionProps, 'data'>) => {
  const { t } = useTranslation()
  const { report, previous, humanComparable, period } = data
  const totals = report.totals
  const lines = linesOf(totals)
  const human = humanComparable ? previous : null
  const estimatedShare = shareOf(totals.agentWorkEstimatedMs, totals.agentWorkMs)
  const measuredShare = totals.agentWorkMs > 0 ? 1 - estimatedShare : 0

  return (
    <Section title={t('statistics.overview.title')} help={<StatisticsHelp topic="overview" />}>
      <div className={styles.tiles}>
        <OverviewTile
          title={t('statistics.overview.code')}
          icon={Code2}
          value={formatCount(lines.total)}
          unit={t('statistics.overview.linesUnit')}
          compare={{
            current: lines.total,
            previous: human ? linesOf(human).total : null,
            format: formatCount,
          }}
          period={period}>
          <ShareBar
            label={t('statistics.overview.codeShare', {
              you: formatPercent(shareOf(lines.you, lines.total)),
              agents: formatPercent(shareOf(lines.agents, lines.total)),
            })}
            legend
            segments={[
              {
                key: 'you',
                label: t('statistics.you'),
                value: lines.you,
                tone: YOU_TONE,
                valueLabel: formatPercent(shareOf(lines.you, lines.total)),
              },
              {
                key: 'agents',
                label: t('statistics.agents'),
                value: lines.agents,
                tone: AGENTS_TONE,
                valueLabel: formatPercent(shareOf(lines.agents, lines.total)),
              },
            ]}
          />
          <p className={styles.note}>
            {t('statistics.overview.codeFoot', {
              changes: t('statistics.changes', {
                added: formatCount(totals.agentLinesAdded + totals.manualLinesAdded),
                removed: formatCount(totals.agentLinesRemoved + totals.manualLinesRemoved),
              }),
              files: formatCount(totals.agentFiles),
            })}
          </p>
        </OverviewTile>
        <OverviewTile
          title={t('statistics.overview.agentTime')}
          icon={Timer}
          value={formatDuration(totals.agentWorkMs)}
          unit={t('statistics.overview.agentTimeUnit')}
          compare={{
            current: totals.agentWorkMs,
            previous: previous?.agentWorkMs ?? null,
            format: formatDuration,
          }}
          period={period}>
          <ShareBar
            label={t('statistics.overview.estimateShare', {
              measured: formatPercent(measuredShare),
              estimated: formatPercent(estimatedShare),
            })}
            legend
            segments={[
              {
                key: 'measured',
                label: t('statistics.overview.measured'),
                value: totals.agentWorkMs - totals.agentWorkEstimatedMs,
                tone: AGENTS_TONE,
                valueLabel: formatPercent(measuredShare),
              },
              {
                key: 'estimated',
                label: t('statistics.overview.estimated'),
                value: totals.agentWorkEstimatedMs,
                tone: 'other',
                valueLabel: formatPercent(estimatedShare),
              },
            ]}
          />
          <p className={styles.note}>
            {t('statistics.overview.wall', { value: formatDuration(totals.agentWallMs) })}
          </p>
        </OverviewTile>
        <OverviewTile
          title={t('statistics.overview.presence')}
          icon={UserRound}
          value={formatDuration(totals.presenceMinutes * MINUTE_MS)}
          compare={{
            current: totals.presenceMinutes * MINUTE_MS,
            previous: human ? human.presenceMinutes * MINUTE_MS : null,
            format: formatDuration,
          }}
          period={period}>
          <p className={styles.note}>
            {t('statistics.overview.sessions', {
              count: report.workSessions.count,
              longest: formatDuration(report.workSessions.longestMinutes * MINUTE_MS),
            })}
          </p>
        </OverviewTile>
        <OverviewTile
          title={t('statistics.overview.tokens')}
          icon={Coins}
          value={formatCount(tokensOf(totals.tokens))}
          unit={t('statistics.overview.tokensUnit')}
          compare={{
            current: tokensOf(totals.tokens),
            previous: previous ? tokensOf(previous.tokens) : null,
            format: formatCount,
          }}
          period={period}>
          <p className={styles.note}>
            {t('statistics.overview.cost', {
              cost: formatCost(totals.cost),
              cache: formatPercent(totals.cacheShare),
            })}
          </p>
        </OverviewTile>
      </div>
    </Section>
  )
}
