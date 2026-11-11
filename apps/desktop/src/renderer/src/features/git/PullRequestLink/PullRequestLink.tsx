import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { usePullRequest } from '../git.queries'
import { PULL_REQUEST_ICONS } from './PullRequestLink.constants'
import type { PullRequestLinkProps } from './PullRequestLink.types'

/**
 * PR текущей ветки справа от неё в шапке окна: номер и значок состояния, нажатие
 * открывает PR в браузере. PR нет, gh не установлен или не вошёл - ничего.
 */
export const PullRequestLink = ({ projectId, branch }: PullRequestLinkProps) => {
  const { t } = useTranslation()
  const { data: pullRequest } = usePullRequest(projectId, branch)

  if (!pullRequest) return null

  const label = t('git.pullRequest.label', {
    number: pullRequest.number,
    state: t(`git.pullRequest.states.${pullRequest.state}`),
  })

  // Новое окно главный процесс не открывает, а отдаёт адрес браузеру (main-window.ts).
  const handleOpen = () => window.open(pullRequest.url, '_blank', 'noopener')

  return (
    <Tooltip label={label}>
      <Button
        variant="ghost"
        icon={PULL_REQUEST_ICONS[pullRequest.state]}
        aria-label={label}
        onClick={handleOpen}>
        {t('git.pullRequest.number', { number: pullRequest.number })}
      </Button>
    </Tooltip>
  )
}
