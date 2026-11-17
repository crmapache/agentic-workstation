import { CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'
import { TextArea } from '@agentic-workstation/ui/TextArea'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useTaskForm } from './TaskModal.hooks'
import styles from './TaskModal.module.scss'
import type { TaskModalProps } from './TaskModal.types'
import { ChoiceField } from './parts/ChoiceField'
import { RunOptions } from './parts/RunOptions'
import { ScheduleFields } from './parts/ScheduleFields'

/**
 * Окно задания: имя, проект, что делать, ритм и как идёт (модель, разрешения, переключатели).
 * Новое и правка - одним окном; удаление - в его подвале, вторым нажатием.
 */
export const TaskModal = ({ taskId }: TaskModalProps) => {
  const { t } = useTranslation()
  const form = useTaskForm(taskId)
  const title = form.task ? t('tasks.form.editTitle') : t('tasks.form.newTitle')

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
        <ChoiceField
          label={t('tasks.form.project')}
          value={form.draft.projectPath}
          choices={form.choices}
          onPick={(projectPath) => form.change({ projectPath })}
        />
        <TextArea
          resizable
          label={t('tasks.form.prompt')}
          placeholder={t('tasks.form.promptPlaceholder')}
          value={form.draft.prompt}
          onChange={(prompt) => form.change({ prompt })}
        />
        <ScheduleFields schedule={form.schedule} onChange={form.changeSchedule} />
        <RunOptions draft={form.draft} onChange={form.change} />
      </div>
    </Modal>
  )
}
