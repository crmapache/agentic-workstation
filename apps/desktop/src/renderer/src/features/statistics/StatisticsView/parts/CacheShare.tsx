import { useTranslation } from 'react-i18next'

import { Section } from '@agentic-workstation/ui/Section'
import { ShareBar } from '@agentic-workstation/ui/ShareBar'

import type { CacheShareProps } from '../StatisticsView.types'
import { shareOf, formatCount, formatPercent } from '../../statistics-format.utils'
import { CACHE_READ_TONE, CACHE_WRITE_TONE } from '../../statistics.constants'

/**
 * Из чего сложен вход модели: чтение кеша, запись кеша и свежий вход. Чем больше чтения
 * кеша, тем дешевле долгий разговор - доля видна и полосой, и числами.
 */
export const CacheShare = ({ tokens }: CacheShareProps) => {
  const { t } = useTranslation()
  const input = tokens.input + tokens.cacheRead + tokens.cacheWrite
  const parts = [
    {
      key: 'read',
      label: t('statistics.tokens.cacheRead'),
      value: tokens.cacheRead,
      tone: CACHE_READ_TONE,
    },
    {
      key: 'write',
      label: t('statistics.tokens.cacheWrite'),
      value: tokens.cacheWrite,
      tone: CACHE_WRITE_TONE,
    },
    {
      key: 'fresh',
      label: t('statistics.tokens.fresh'),
      value: tokens.input,
      tone: 'other' as const,
    },
  ]

  return (
    <Section size="sm" title={t('statistics.tokens.cache')} count={formatCount(input)}>
      <ShareBar
        label={t('statistics.tokens.cacheLabel', {
          read: formatPercent(shareOf(tokens.cacheRead, input)),
          write: formatPercent(shareOf(tokens.cacheWrite, input)),
          fresh: formatPercent(shareOf(tokens.input, input)),
        })}
        legend
        segments={parts.map((part) => ({
          ...part,
          valueLabel: `${formatCount(part.value)} · ${formatPercent(shareOf(part.value, input))}`,
        }))}
      />
    </Section>
  )
}
