import { Flag, Repeat, Workflow, AlarmClock, CalendarDays, AlarmClockOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'

import styles from '../CardTile.module.scss'
import type { CardMetaProps } from '../CardTile.types'
import { useDueLabel, useRepeatLabel, useScenarioName } from '../../tracker.hooks'
import { dueTone, runTone, priorityTone } from '../../tracker.utils'

/**
 * Нижняя строка карточки: срок (со знаком повтора), приоритет и сценарий с состоянием прогона -
 * будильник вместо значка сценария, если он запускается в срок, и метка, если запуск не ушёл.
 */
export const CardMeta = ({ card, today }: CardMetaProps) => {
  const { t } = useTranslation()
  const dueLabel = useDueLabel(card.due, today)
  const scenarioName = useScenarioName(card.scenario)
  const repeatLabel = useRepeatLabel()
  const priority = priorityTone(card.priority)
  const run = card.run && runTone(card.run)

  if (!card.due && !priority && !card.scenario) return null

  return (
    <div className={styles.meta}>
      {card.due && (
        <Badge tone={dueTone(card.due, today, card.done)} variant="soft" icon={CalendarDays}>
          {dueLabel}
          {card.repeat && (
            <Repeat
              className={styles.metaIcon}
              role="img"
              aria-label={t('tracker.repeat.badge', { rule: repeatLabel(card.repeat) })}
            />
          )}
        </Badge>
      )}
      {priority && (
        <Badge tone={priority} variant="soft" icon={Flag}>
          {t('tracker.priority.short', { level: card.priority })}
        </Badge>
      )}
      {card.scenario && (
        <Badge
          tone={run ?? 'neutral'}
          variant={run ? 'soft' : 'marker'}
          icon={card.autoRun ? AlarmClock : Workflow}
          iconLabel={card.autoRun ? t('tracker.autoRun.badge') : undefined}>
          {run && card.run
            ? t(`tracker.run.${card.run.state as Exclude<typeof card.run.state, 'gone'>}`, {
                name: scenarioName,
              })
            : scenarioName}
        </Badge>
      )}
      {card.scenario && card.autoRun && card.autoRunFailure && (
        <Badge tone="danger" variant="soft" icon={AlarmClockOff}>
          {t('tracker.autoRun.didNotStart')}
        </Badge>
      )}
    </div>
  )
}
