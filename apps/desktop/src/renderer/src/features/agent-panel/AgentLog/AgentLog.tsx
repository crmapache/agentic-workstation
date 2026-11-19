import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { journalSteps } from '../agents.utils'
import { Markdown } from '../Markdown/Markdown'
import { WorkflowRun } from '../WorkflowRun/WorkflowRun'
import styles from './AgentLog.module.scss'
import type { AgentLogProps } from './AgentLog.types'
import { endNoteOf } from './AgentLog.utils'
import { AgentWorking } from './parts/AgentWorking'
import { JournalSteps } from './parts/JournalSteps'

/**
 * Что делал агент: флот (у workflow), его шаги, почему закрыт и его отчёт в конце. Один
 * компонент на два места - нутро карточки в ленте и экран чипа потока: вторая копия
 * разошлась бы с первой на первой же правке.
 */
export const AgentLog = ({ tool, steps }: AgentLogProps) => {
  const { t } = useTranslation()
  const task = tool.task
  const journal = journalSteps(steps)
  const trimmed = journal.steps.length > 0 ? journal.trimmed : (task?.trimmed ?? 0)
  // Шаги из task_progress - журнал агента без своего потока (поднятого скиллом); у агента
  // со своим потоком те же шаги видны богаче - его вызовами.
  const progress = journal.steps.length > 0 ? [] : (task?.steps ?? [])
  const note = endNoteOf(t, tool)
  const report = tool.status === 'running' ? '' : (tool.result?.text ?? '')

  return (
    <div className={styles.agentLog}>
      {task?.fleet && <WorkflowRun tool={tool} fleet={task.fleet} />}
      {trimmed > 0 && (
        <div className={styles.trimmed}>{t('agentPanel.agents.trimmed', { count: trimmed })}</div>
      )}
      {journal.steps.length > 0 && <JournalSteps steps={journal.steps} />}
      {progress.length > 0 && (
        <div className={styles.progress}>
          {progress.map((step, index) => (
            <div key={index} className={styles.step}>
              {t('agentPanel.agents.progressStep', { name: step })}
            </div>
          ))}
        </div>
      )}
      {note && (
        <div className={clsx(styles.note, note.tone === 'bad' && styles.bad)}>{note.text}</div>
      )}
      {report && (
        <div className={clsx(styles.report, tool.status === 'error' && styles.failed)}>
          <Markdown text={report} />
        </div>
      )}
      {tool.status === 'running' && <AgentWorking tool={tool} />}
    </div>
  )
}
