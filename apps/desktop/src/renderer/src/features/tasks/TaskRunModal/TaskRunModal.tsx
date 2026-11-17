import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { isRunOpen } from '@shared/tasks'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import { STATE_TONES, CLOCK_TICK_MS } from '../tasks.constants'
import { useTaskWords } from '../tasks.hooks'
import { durationOf } from '../TasksView/TasksView.utils'
import { useNow } from '../../../lib/now.hooks'
import { useTaskRunStore } from '../../../state/task-run.store'
import { useTaskRun, useTaskGoal } from '../../../state/tasks.queries'
import { RUN_SECTIONS, GOAL_SECTIONS } from './TaskRunModal.constants'
import styles from './TaskRunModal.module.scss'
import type { RunSection, TaskRunModalProps } from './TaskRunModal.types'
import { RunAsking } from './parts/RunAsking'
import { RunFooter } from './parts/RunFooter'
import { RunGoal } from './parts/RunGoal'
import { RunLog } from './parts/RunLog'
import { RunReport } from './parts/RunReport'

/**
 * Прогон задания окном по центру: состояние, чем поднят и когда, сколько шёл и стоил; вопросы,
 * на которых стоит, - сверху; отчёт и разговор целиком - разделами, у поручения первым - оно
 * само (чего ждёт, журнал, история); подвал - сказать прогону, разбудить, остановить, открыть
 * разговор вкладкой панели.
 */
export const TaskRunModal = ({ runId }: TaskRunModalProps) => {
  const { t } = useTranslation()
  const { data: run } = useTaskRun(runId)
  const { data: life } = useTaskGoal(runId, true)
  const close = useTaskRunStore((state) => state.close)
  const words = useTaskWords()
  const now = useNow(true, CLOCK_TICK_MS)
  const [picked, setPicked] = useState<RunSection | null>(null)

  if (!run) return null

  const ids = life ? GOAL_SECTIONS : RUN_SECTIONS
  const section = picked && ids.includes(picked) ? picked : (ids[0] ?? 'report')
  const sections = ids.map((id) => ({ id, label: t(`tasks.run.tabs.${id}`) }))
  const facts = [
    t(`tasks.triggers.${run.trigger}`),
    words.moment(run.startedAt, now),
    durationOf(run, now),
    run.costUsd > 0 ? t('tasks.run.cost', { cost: run.costUsd.toFixed(2) }) : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Modal
      open
      size="lg"
      tall
      icon={CalendarClock}
      title={run.taskName}
      description={facts}
      headerActions={<Badge tone={STATE_TONES[run.state]}>{t(`tasks.states.${run.state}`)}</Badge>}
      footer={<RunFooter run={run} />}
      closeLabel={t('common.close')}
      onClose={close}>
      <div className={styles.body}>
        <RunAsking run={run} />
        <div className={styles.picker}>
          <Tabs
            label={t('tasks.run.tabs.label')}
            items={sections}
            value={section}
            onChange={setPicked}
          />
        </div>
        {section === 'goal' && life ? (
          <RunGoal life={life} now={now} workUsd={run.costUsd} open={isRunOpen(run.state)} />
        ) : section === 'log' ? (
          <RunLog run={run} life={life ?? null} />
        ) : (
          <RunReport run={run} />
        )}
      </div>
    </Modal>
  )
}
