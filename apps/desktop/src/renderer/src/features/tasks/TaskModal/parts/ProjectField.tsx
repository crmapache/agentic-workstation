import { useTranslation } from 'react-i18next'

import styles from '../TaskModal.module.scss'
import type { ProjectFieldProps } from '../TaskModal.types'
import { isMoveBlocked, projectChoices } from '../TaskModal.utils'
import { useAppInfo } from '../../../../state/app-info.queries'
import { useTasks } from '../../../../state/tasks.queries'
import { useWorkspace } from '../../../../state/workspace.queries'
import { ChoiceField } from './ChoiceField'

/**
 * Проект задания при правке (ADR 0081): другой проект - перенос. Под полем - что будет при
 * сохранении, а пока прогон идёт или поручение спит - что перенос подождёт.
 */
export const ProjectField = ({ task, value, onPick }: ProjectFieldProps) => {
  const { t } = useTranslation()
  const { data: workspace } = useWorkspace()
  const { data: appInfo } = useAppInfo()
  const runs = useTasks().data?.runs ?? []
  const projects = [...(workspace?.projects ?? []), ...(workspace?.recentProjects ?? [])]
  const choices = projectChoices(projects, task.projectPath, appInfo?.homeDir)
  const target = choices.find((choice) => choice.value === value)?.label ?? value
  const moving = value !== task.projectPath

  return (
    <div className={styles.field}>
      <ChoiceField
        label={t('tasks.form.project')}
        value={value}
        choices={choices}
        onPick={onPick}
      />
      {moving && (
        <span className={styles.note}>
          {isMoveBlocked(runs, task.id)
            ? t('tasks.form.moveBusy')
            : t('tasks.form.moveNote', { name: target })}
        </span>
      )}
    </div>
  )
}
