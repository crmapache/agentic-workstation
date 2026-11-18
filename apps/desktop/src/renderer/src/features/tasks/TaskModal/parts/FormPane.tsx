import { useTranslation } from 'react-i18next'

import { TASK_KINDS } from '@shared/tasks'
import type { TaskKind } from '@shared/tasks'

import { Tabs } from '@agentic-workstation/ui/Tabs'
import { TextArea } from '@agentic-workstation/ui/TextArea'
import { TextField } from '@agentic-workstation/ui/TextField'

import styles from '../TaskModal.module.scss'
import type { FormPaneProps } from '../TaskModal.types'
import { GoalFields } from './GoalFields'
import { ProjectField } from './ProjectField'
import { RunOptions } from './RunOptions'
import { ScheduleFields } from './ScheduleFields'

/**
 * Форма задания: имя, вид (по расписанию или до результата), что делать, ритм или пределы
 * поручения и как идёт. Её заполняет человек или ИИ со вкладки «With AI» - тогда человек
 * проверяет написанное здесь же. Проект выбирается только при правке: новое встаёт в открытый.
 */
export const FormPane = ({ task, draft, schedule, onChange, onChangeSchedule }: FormPaneProps) => {
  const { t } = useTranslation()
  const kinds = TASK_KINDS.map((id) => ({ id, label: t(`tasks.form.kinds.${id}`) }))
  const isGoal = draft.kind === 'goal'

  return (
    <>
      <TextField
        data-autofocus
        label={t('tasks.form.name')}
        placeholder={t('tasks.form.namePlaceholder')}
        value={draft.name}
        onChange={(name) => onChange({ name })}
      />
      <div className={styles.field}>
        <span className={styles.caption} aria-hidden>
          {t('tasks.form.kind')}
        </span>
        <div className={styles.picker}>
          <Tabs
            label={t('tasks.form.kind')}
            items={kinds}
            value={draft.kind}
            onChange={(kind: TaskKind) => onChange({ kind })}
          />
        </div>
      </div>
      <TextArea
        resizable
        label={t('tasks.form.prompt')}
        placeholder={isGoal ? t('tasks.form.goalPlaceholder') : t('tasks.form.promptPlaceholder')}
        value={draft.prompt}
        onChange={(prompt) => onChange({ prompt })}
      />
      {isGoal ? (
        <GoalFields draft={draft} onChange={onChange} />
      ) : (
        <ScheduleFields schedule={schedule} onChange={onChangeSchedule} />
      )}
      {task && (
        <ProjectField
          task={task}
          value={draft.projectPath}
          onPick={(projectPath) => onChange({ projectPath })}
        />
      )}
      <RunOptions draft={draft} onChange={onChange} />
    </>
  )
}
