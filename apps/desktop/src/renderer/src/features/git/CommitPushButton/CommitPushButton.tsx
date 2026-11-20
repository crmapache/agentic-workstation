import { CloudUpload } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Spinner } from '@agentic-workstation/ui/Spinner'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { useCommitPush } from '../commit-push.hooks'
import { useGitLineStats } from '../git.queries'
import styles from './CommitPushButton.module.scss'
import type { CommitPushButtonProps } from './CommitPushButton.types'

/**
 * Commit and push в шапке, сразу за счётом строк: все изменения проекта одним коммитом, сообщение
 * пишет ИИ из Settings → Git, затем push текущей ветки. Изменений нет - кнопки нет, как и счёта.
 * Пока идёт - спиннер на её месте: ИИ пишет сообщение секунды, push ходит в сеть.
 */
export const CommitPushButton = ({ projectId }: CommitPushButtonProps) => {
  const { t } = useTranslation()
  const { data: stats } = useGitLineStats(projectId)
  const { run, isRunning } = useCommitPush(projectId)

  if (isRunning) {
    return (
      <Tooltip label={t('git.commitPush.running')}>
        <span className={styles.running} role="status" tabIndex={0}>
          <Spinner label={t('git.commitPush.running')} />
        </span>
      </Tooltip>
    )
  }

  if (!stats || stats.files === 0) return null

  return (
    <IconButton icon={CloudUpload} label={t('git.commitPush.label')} onClick={() => void run()} />
  )
}
