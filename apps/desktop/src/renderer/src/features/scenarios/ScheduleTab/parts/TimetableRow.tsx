import clsx from 'clsx'
import { Play, Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../ScheduleTab.module.scss'
import type { TimetableRowProps } from '../ScheduleTab.types'
import { answerChips, minutesOfDay } from '../../scenarios-forms.utils'
import { countdown, clockLabel, weekdayName } from '../../scenarios-hours.utils'
import { momentLabel } from '../../scenarios-moments.utils'
import { ScenarioFormsAnswers } from '../../ScenarioFormsAnswers/ScenarioFormsAnswers'

/**
 * Строка расписания: час в жёлобе (консольным шрифтом - показание часов) и под ним одно слово о
 * часе - «missed» или сколько ждать; справа имя, ритм, worktree и ответы чипами. Сценарий,
 * которого нет ни на одной полке, - серой строкой: с ней осталось одно дело, удалить.
 */
export const TimetableRow = ({ row, now, onEdit, onRemove, onRunNow }: TimetableRowProps) => {
  const { t } = useTranslation()
  const { schedule, scenario, missed } = row
  const rhythm = t(`scenarios.schedule.repeats.${schedule.repeat}`, {
    day: weekdayName(schedule.weekday, 'long'),
  })
  const words = {
    todayAt: (clock: string) => t('scenarios.schedule.todayAt', { clock }),
    yesterdayAt: (clock: string) => t('scenarios.schedule.yesterdayAt', { clock }),
  }
  const hasAnswers = answerChips(schedule.inputs).length > 0

  return (
    <li className={clsx(styles.row, !scenario && styles.orphan)}>
      {/* Пропущенный час стоит по моменту пропуска, а не по нынешнему часу записи. */}
      <span className={styles.gutter}>
        <span className={styles.clock}>
          {clockLabel(missed ? minutesOfDay(row.at) : schedule.at)}
        </span>
        <span className={clsx(styles.away, missed && styles.awayMissed)}>
          {missed
            ? t('scenarios.schedule.missed')
            : t('scenarios.schedule.inTime', { time: countdown(row.at - now) })}
        </span>
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{scenario?.name ?? t('scenarios.schedule.orphan')}</span>
        <span className={styles.facts}>
          <span className={styles.rhythm}>{rhythm}</span>
          {/* Ритм, пропустивший свой час, говорит об этом до следующего сработавшего. */}
          {!missed && schedule.repeat !== 'once' && schedule.missedAt > 0 && (
            <span className={styles.missedNote}>
              {t('scenarios.schedule.missedAt', {
                when: momentLabel(schedule.missedAt, words, now),
              })}
            </span>
          )}
          {schedule.worktree && (
            <Tooltip label={t('scenarios.schedule.worktreeHint')}>
              <Badge tone="info">{t('scenarios.schedule.worktree')}</Badge>
            </Tooltip>
          )}
          {hasAnswers ? (
            <ScenarioFormsAnswers inputs={schedule.inputs} />
          ) : (
            <span className={styles.noAnswers}>{t('scenarios.schedule.noAnswers')}</span>
          )}
        </span>
      </span>
      <span className={styles.actions}>
        {scenario && (
          <Button
            size="sm"
            variant={missed ? 'primary' : 'ghost'}
            icon={missed ? Play : undefined}
            onClick={() => onRunNow(row)}>
            {t('scenarios.schedule.runNow')}
          </Button>
        )}
        {scenario && (
          <IconButton
            icon={Pencil}
            size="sm"
            label={t('scenarios.schedule.edit')}
            onClick={() => onEdit(row)}
          />
        )}
        <IconButton
          icon={Trash2}
          size="sm"
          label={t('scenarios.schedule.remove')}
          onClick={() => onRemove(row)}
        />
      </span>
    </li>
  )
}
