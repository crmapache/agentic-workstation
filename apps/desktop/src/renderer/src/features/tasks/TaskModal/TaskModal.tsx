import { useState } from 'react'
import { PenLine, WandSparkles, CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Modal } from '@agentic-workstation/ui/Modal'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import { useTaskForm, useTaskAuthor } from './TaskModal.hooks'
import styles from './TaskModal.module.scss'
import type { TaskModalMode, TaskModalProps } from './TaskModal.types'
import { AuthorPane } from './parts/AuthorPane'
import { FormPane } from './parts/FormPane'

/**
 * Окно задания: имя, вид (по расписанию или до результата), что делать, ритм или пределы
 * поручения и как идёт (модель, усилие, разрешения, переключатели). Новое встаёт в открытый
 * проект, правка может перенести задание в другой (ADR 0081). Новое и правка - одним окном;
 * удаление - в его подвале, вторым нажатием. Новое
 * начинается с вкладки «With AI»: человек говорит своими словами, ИИ заполняет форму, человек
 * её проверяет и сохраняет. Правка - сразу форма.
 */
export const TaskModal = ({ taskId }: TaskModalProps) => {
  const { t } = useTranslation()
  const form = useTaskForm(taskId)
  const [mode, setMode] = useState<TaskModalMode>(taskId === null ? 'ai' : 'form')
  const author = useTaskAuthor(form.draft.projectPath, (task) => {
    form.apply(task)
    setMode('form')
  })
  const title = form.task ? t('tasks.form.editTitle') : t('tasks.form.newTitle')
  const modes = [
    { id: 'ai' as const, label: t('tasks.form.ways.ai'), icon: WandSparkles },
    { id: 'form' as const, label: t('tasks.form.ways.form'), icon: PenLine },
  ]
  const isAuthoring = mode === 'ai' && !form.task

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
        isAuthoring ? (
          <div className={styles.footerEnd}>
            {author.writing ? (
              <Button variant="ghost" onClick={author.stop}>
                {t('tasks.form.author.stop')}
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={form.close}>
                  {t('tasks.form.cancel')}
                </Button>
                <Button variant="primary" disabled={!author.canWrite} onClick={author.write}>
                  {t('tasks.form.author.write')}
                </Button>
              </>
            )}
          </div>
        ) : (
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
        )
      }
      closeLabel={t('common.close')}
      onClose={form.close}>
      <div className={styles.body}>
        {!form.task && (
          <Tabs
            fill
            label={t('tasks.form.ways.label')}
            items={modes}
            value={mode}
            onChange={setMode}
          />
        )}
        {isAuthoring ? (
          <AuthorPane
            description={author.description}
            writing={author.writing}
            failure={author.failure}
            onDescribe={author.describe}
          />
        ) : (
          <FormPane
            task={form.task}
            draft={form.draft}
            schedule={form.schedule}
            onChange={form.change}
            onChangeSchedule={form.changeSchedule}
          />
        )}
      </div>
    </Modal>
  )
}
