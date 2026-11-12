import { useMemo, useState, useEffect } from 'react'
import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import { useLocalHistory } from '../local-history.queries'
import { useSelectionStore } from '../../../state/selection.store'
import styles from './LocalHistoryView.module.scss'
import type { LocalHistoryViewProps } from './LocalHistoryView.types'
import { historyDays, historyRows } from './LocalHistoryView.utils'
import { HistoryDiff } from './parts/HistoryDiff'
import { HistoryHeader } from './parts/HistoryHeader'
import { RevisionList } from './parts/RevisionList'

/**
 * Вкладка локальной истории (ADR 0045), как Local History в WebStorm: версии файла, папки
 * или всего проекта за месяц по дням, справа - разница выбранной, «Restore» - вернуть её.
 * Отдельный ленивый кусок с Monaco, как разница с коммитом. По умолчанию выбрана самая
 * новая версия; выбранная пропала из списка (ушла за срок) - снова самая новая.
 */
export const LocalHistoryView = ({
  projectId,
  projectName,
  path,
  isActive,
}: LocalHistoryViewProps) => {
  const { t } = useTranslation()
  const { data: list } = useLocalHistory(projectId, path)
  const [selected, setSelected] = useState<string | null>(null)
  const entries = list?.entries
  const isFolder = list?.scope === 'folder'
  const rows = useMemo(() => historyRows(entries ?? [], path, isFolder), [entries, path, isFolder])
  const days = useMemo(() => historyDays(rows), [rows])
  const row = rows.find((candidate) => candidate.key === selected) ?? rows[0] ?? null
  const retentionDays = list?.retentionDays ?? 0
  const showHistoryFile = useSelectionStore((state) => state.showHistoryFile)
  const shownFile = row?.path

  // Открытый файл для Claude Code, пока активна история, - тот, что показан справа.
  useEffect(() => {
    showHistoryFile(projectId, shownFile)

    return () => showHistoryFile(projectId, undefined)
  }, [projectId, shownFile, showHistoryFile])

  return (
    <div className={styles.view}>
      <HistoryHeader
        projectId={projectId}
        projectName={projectName}
        path={path}
        isFolder={isFolder}
        row={row}
        retentionDays={retentionDays}
      />
      {list && !row && (
        <EmptyState
          icon={History}
          title={t('localHistory.emptyTitle')}
          description={t(
            isFolder || path === '' ? 'localHistory.emptyFolderText' : 'localHistory.emptyFileText',
            {
              days: retentionDays,
            },
          )}
        />
      )}
      {row && (
        <div className={styles.body}>
          <RevisionList
            days={days}
            isFolder={isFolder}
            selected={row.key}
            truncated={list?.truncated ?? false}
            onSelect={setSelected}
          />
          <HistoryDiff projectId={projectId} row={row} isActive={isActive} />
        </div>
      )}
    </div>
  )
}
