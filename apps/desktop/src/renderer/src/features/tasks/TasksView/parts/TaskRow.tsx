import clsx from 'clsx'
import { Play, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Switch } from '@agentic-workstation/ui/Switch'

import styles from '../TasksView.module.scss'
import type { TaskRowProps } from '../TasksView.types'
import { useTaskActions } from '../../tasks.actions'
import { STATE_TONES } from '../../tasks.constants'
import { useTaskWords } from '../../tasks.hooks'
import { useTasksStore } from '../../tasks.store'
import { useTaskRunStore } from '../../../../state/task-run.store'

/**
 * Задание строкой: имя, под ним ритм словами с ближайшим сроком и последний прогон (метка
 * открывает его); справа - «по расписанию» переключателем, запуск сейчас и правка. Выключенное -
 * тише. Сроки - под именем, а не колонкой: в узкой середине колонка съедала бы ритм.
 */
export const TaskRow = ({ task, lastRun, now }: TaskRowProps) => {
  const { t } = useTranslation()
  const words = useTaskWords()
  const actions = useTaskActions()
  const edit = useTasksStore((state) => state.edit)
  const openRun = useTaskRunStore((state) => state.open)
  const scheduled = task.schedule.repeat !== 'manual'
  // У задания «вручную» срока нет - это уже сказано ритмом слева.
  const next = !scheduled
    ? null
    : task.enabled && task.nextAt
      ? t('tasks.row.next', { when: words.moment(task.nextAt, now) })
      : t('tasks.row.paused')

  return (
    <div className={clsx(styles.row, !task.enabled && styles.paused)}>
      <div className={styles.main}>
        <span className={styles.name}>{task.name}</span>
        <span className={styles.schedule}>
          {[words.schedule(task.schedule), next].filter(Boolean).join(' · ')}
        </span>
        {lastRun ? (
          <button type="button" className={styles.lastRun} onClick={() => openRun(lastRun.id)}>
            <Badge tone={STATE_TONES[lastRun.state]}>{t(`tasks.states.${lastRun.state}`)}</Badge>
            {t('tasks.row.lastRun', { when: words.moment(lastRun.startedAt, now) })}
          </button>
        ) : (
          <span className={styles.when}>{t('tasks.row.neverRun')}</span>
        )}
      </div>
      <div className={styles.controls}>
        {scheduled && (
          <Switch
            labelHidden
            label={t('tasks.actions.enable')}
            checked={task.enabled}
            onChange={(enabled) => void actions.setEnabled(task.id, enabled)}
          />
        )}
        <IconButton
          icon={Play}
          size="sm"
          label={t('tasks.actions.runNow')}
          onClick={() => void actions.runNow(task.id)}
        />
        <IconButton
          icon={Pencil}
          size="sm"
          label={t('tasks.actions.edit')}
          onClick={() => edit(task.id)}
        />
      </div>
    </div>
  )
}
