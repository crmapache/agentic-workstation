import { Flag, Workflow, CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'

import { useDueLabel } from '../CardTile.hooks'
import styles from '../CardTile.module.scss'
import type { CardMetaProps } from '../CardTile.types'
import { useScenarioName } from '../../tracker.hooks'
import { dueTone, runTone, priorityTone } from '../../tracker.utils'

/** Нижняя строка карточки: срок, приоритет и сценарий с состоянием прогона. */
export const CardMeta = ({ card, today }: CardMetaProps) => {
  const { t } = useTranslation()
  const dueLabel = useDueLabel(card.due, today)
  const scenarioName = useScenarioName(card.scenario)
  const priority = priorityTone(card.priority)
  const run = card.run && runTone(card.run)

  if (!card.due && !priority && !card.scenario) return null

  return (
    <div className={styles.meta}>
      {card.due && (
        <Badge tone={dueTone(card.due, today, card.done)} variant="soft">
          <CalendarDays className={styles.metaIcon} aria-hidden />
          {dueLabel}
        </Badge>
      )}
      {priority && (
        <Badge tone={priority} variant="soft">
          <Flag className={styles.metaIcon} aria-hidden />
          {t('tracker.priority.short', { level: card.priority })}
        </Badge>
      )}
      {card.scenario && (
        <Badge tone={run ?? 'neutral'} variant={run ? 'soft' : 'marker'}>
          <Workflow className={styles.metaIcon} aria-hidden />
          {run && card.run
            ? t(`tracker.run.${card.run.state as Exclude<typeof card.run.state, 'gone'>}`, {
                name: scenarioName,
              })
            : scenarioName}
        </Badge>
      )}
    </div>
  )
}
