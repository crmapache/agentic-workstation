import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { useGitLineStats } from '../git.queries'
import { useLayoutStore } from '../../../state/layout.store'
import { LINE_COUNT } from './LineStats.constants'
import styles from './LineStats.module.scss'
import type { LineStatsProps } from './LineStats.types'

/**
 * Счёт строк с последнего коммита в шапке, справа от ветки: «+12 −3» - видно, есть ли
 * изменения, не открывая списка. Нажатие показывает вид Changes. Изменений нет, папка не в
 * git или git не ответил - ничего.
 */
export const LineStats = ({ projectId }: LineStatsProps) => {
  const { t } = useTranslation()
  const { data: stats } = useGitLineStats(projectId)
  const showSideView = useLayoutStore((state) => state.showSideView)

  if (!stats || stats.files === 0) return null

  const added = LINE_COUNT.format(stats.added)
  const deleted = LINE_COUNT.format(stats.deleted)
  const label = t(stats.partial ? 'git.lineStats.labelPartial' : 'git.lineStats.label', {
    files: t('git.lineStats.files', { count: stats.files, shown: LINE_COUNT.format(stats.files) }),
    added,
    deleted,
  })

  const handleShow = () => showSideView('changes')

  return (
    <Tooltip label={label}>
      <Button variant="ghost" aria-label={label} onClick={handleShow}>
        <span className={styles.added}>{`+${added}`}</span>
        <span className={styles.deleted}>{`−${deleted}`}</span>
      </Button>
    </Tooltip>
  )
}
