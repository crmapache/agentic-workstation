import { History, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { HelpButton } from '@agentic-workstation/ui/HelpButton'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { useWhenLabels } from '../LocalHistoryView.hooks'
import styles from '../LocalHistoryView.module.scss'
import type { HistoryHeaderProps } from '../LocalHistoryView.types'
import { useRestoreVersion } from '../../local-history.queries'
import { PathTitle } from '../../PathTitle/PathTitle'

/**
 * Шапка истории, как панель над разницей с коммитом: чья история (файл с папкой, папка или
 * весь проект - его именем), справка и «Restore» - вернуть выбранную версию в файл.
 */
export const HistoryHeader = ({
  projectId,
  projectName,
  path,
  isFolder,
  row,
  retentionDays,
}: HistoryHeaderProps) => {
  const { t } = useTranslation()
  const restore = useRestoreVersion(projectId)
  const { when } = useWhenLabels()
  const canRestore = row !== null && row.version !== null && !restore.isPending

  const handleRestore = () => {
    if (row?.version) restore.mutate({ path: row.path, key: row.version, when: when(row.at) })
  }

  return (
    <div role="toolbar" aria-label={t('localHistory.toolbar')} className={styles.header}>
      <History className={styles.subjectIcon} aria-hidden />
      <PathTitle path={path || projectName} kind={isFolder ? 'folder' : 'file'} />
      <HelpButton
        label={t('localHistory.help.label')}
        title={t('localHistory.help.title')}
        text={t('localHistory.help.text', { days: retentionDays })}
        closeLabel={t('common.close')}
      />
      <Tooltip label={t('localHistory.restore.hint')}>
        <Button
          variant="primary"
          size="sm"
          icon={RotateCcw}
          disabled={!canRestore}
          onClick={handleRestore}>
          {t('localHistory.restore.action')}
        </Button>
      </Tooltip>
    </div>
  )
}
