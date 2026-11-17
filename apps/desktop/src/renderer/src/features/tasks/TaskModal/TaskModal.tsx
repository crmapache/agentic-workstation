import { CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { TASK_KINDS } from '@shared/tasks'
import type { TaskKind } from '@shared/tasks'

import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Tabs } from '@agentic-workstation/ui/Tabs'
import { TextArea } from '@agentic-workstation/ui/TextArea'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useTaskForm } from './TaskModal.hooks'
import styles from './TaskModal.module.scss'
import type { TaskModalProps } from './TaskModal.types'
import { GoalFields } from './parts/GoalFields'
import { RunOptions } from './parts/RunOptions'
import { ScheduleFields } from './parts/ScheduleFields'

/**
 * Окно задания: имя, вид (по расписанию или до результата), что делать, ритм или пределы
 * поручения и как идёт (модель, разрешения, переключатели). Проект - открытый: задание ему
 * принадлежит. Новое и правка - одним окном; удаление - в его подвале, вторым нажатием.
 */
export const TaskModal = ({ taskId }: TaskModalProps) => {
  const { t } = useTranslation()
  const form = useTaskForm(taskId)
  const title = form.task ? t('tasks.form.editTitle') : t('tasks.form.newTitle')
  const kinds = TASK_KINDS.map((id) => ({ id, label: t(`tasks.form.kinds.${id}`) }))
  const isGoal = form.draft.kind === 'goal'

  return (
    <Modal
      open
      size="lg"
      icon={CalendarClock}
      title={title}
      description={form.task?.name}
      headerActions={
        <HelpButton
          label={t('tasks.form.help.label')}
          title={title}
          text={t('tasks.form.help.text')}
          closeLabel={t('common.close')}
        />
      }
      footer={
        <div className={styles.footer}>
          {form.task && (
            <Button variant="danger" onClick={() => void form.remove()}>
              {form.removing ? t('tasks.form.removeSure') : t('tasks.form.remove')}
            </Button>
          )}
          <div className={styles.footerEnd}>
            <Button variant="ghost" onClick={form.close}>
              {t('tasks.form.cancel')}
            </Button>
            <Button variant="primary" disabled={!form.canSave} onClick={() => void form.save()}>
              {t('tasks.form.save')}
            </Button>
          </div>
        </div>
      }
      closeLabel={t('common.close')}
      onClose={form.close}>
      <div className={styles.body}>
        <TextField
          data-autofocus
          label={t('tasks.form.name')}
          placeholder={t('tasks.form.namePlaceholder')}
          value={form.draft.name}
          onChange={(name) => form.change({ name })}
        />
        <div className={styles.field}>
          <span className={styles.caption} aria-hidden>
            {t('tasks.form.kind')}
          </span>
          <div className={styles.picker}>
            <Tabs
              label={t('tasks.form.kind')}
              items={kinds}
              value={form.draft.kind}
              onChange={(kind: TaskKind) => form.change({ kind })}
            />
          </div>
        </div>
        <TextArea
          resizable
          label={t('tasks.form.prompt')}
          placeholder={isGoal ? t('tasks.form.goalPlaceholder') : t('tasks.form.promptPlaceholder')}
          value={form.draft.prompt}
          onChange={(prompt) => form.change({ prompt })}
        />
        {isGoal ? (
          <GoalFields draft={form.draft} onChange={form.change} />
        ) : (
          <ScheduleFields schedule={form.schedule} onChange={form.changeSchedule} />
        )}
        <RunOptions draft={form.draft} onChange={form.change} />
      </div>
    </Modal>
  )
}
