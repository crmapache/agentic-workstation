import { FileX, FileWarning, FileQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import type { DiffPlaceholderProps } from '../DiffEditor.types'
import { formatSize } from '../../editor.utils'
import { DocumentPlaceholder } from '../../CodeEditor/parts/DocumentPlaceholder'

/**
 * Вместо разницы - почему строк нет: файл на диске - теми же словами, что в редакторе;
 * версия из коммита - не текст, слишком большая или git её не отдал.
 */
export const DiffPlaceholder = ({ state }: DiffPlaceholderProps) => {
  const { t } = useTranslation()

  if (state.kind === 'fileProblem') return <DocumentPlaceholder status={state.status} />

  const { file } = state

  switch (file.kind) {
    case 'binary':
      return (
        <EmptyState
          icon={FileX}
          title={t('editor.binaryTitle')}
          description={t('editor.binaryText')}
        />
      )
    case 'tooLarge':
      return (
        <EmptyState
          icon={FileWarning}
          title={t('editor.tooLargeTitle')}
          description={
            file.size === null
              ? t('editor.diff.headTooLargeText', { limit: formatSize(file.limit) })
              : t('editor.tooLargeText', {
                  size: formatSize(file.size),
                  limit: formatSize(file.limit),
                })
          }
        />
      )
    case 'failed':
      return (
        <EmptyState
          icon={FileQuestion}
          title={t('editor.diff.headFailedTitle')}
          description={t('editor.diff.headFailedText')}
        />
      )
  }
}
