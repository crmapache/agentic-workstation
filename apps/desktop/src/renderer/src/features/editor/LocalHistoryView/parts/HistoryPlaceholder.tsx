import { FileX, FileQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import type { HistoryPlaceholderProps } from '../LocalHistoryView.types'
import { DocumentPlaceholder } from '../../CodeEditor/parts/DocumentPlaceholder'

/**
 * Вместо разницы - почему строк нет: версия не текст (вернуть её всё равно можно), версия
 * пропала, файл сейчас не показать строками - теми же словами, что в редакторе.
 */
export const HistoryPlaceholder = ({ state }: HistoryPlaceholderProps) => {
  const { t } = useTranslation()

  if (state.kind === 'fileProblem') return <DocumentPlaceholder status={state.status} />

  return state.kind === 'binary' ? (
    <EmptyState
      icon={FileX}
      title={t('editor.binaryTitle')}
      description={t('localHistory.placeholders.binary')}
    />
  ) : (
    <EmptyState
      icon={FileQuestion}
      title={t('localHistory.placeholders.lostTitle')}
      description={t('localHistory.placeholders.lost')}
    />
  )
}
