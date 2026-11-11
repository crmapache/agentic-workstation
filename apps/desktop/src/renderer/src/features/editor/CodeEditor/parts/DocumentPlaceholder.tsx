import { FileX, FileMinus, FileWarning, FileQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import type { DocumentPlaceholderProps } from '../CodeEditor.types'
import { formatSize } from '../../editor.utils'

/**
 * Вместо кода - почему его нет: файла нет на диске, не текст, слишком большой, не
 * прочитался. Пока файл читается - пусто: мгновение пустоты лучше мигнувшей надписи.
 */
export const DocumentPlaceholder = ({ status }: DocumentPlaceholderProps) => {
  const { t } = useTranslation()

  switch (status.kind) {
    case 'loading':
      return null
    case 'missing':
      return (
        <EmptyState
          icon={FileMinus}
          title={t('editor.missingTitle')}
          description={t('editor.missingText')}
        />
      )
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
          description={t('editor.tooLargeText', {
            size: formatSize(status.size),
            limit: formatSize(status.limit),
          })}
        />
      )
    case 'unreadable':
      return (
        <EmptyState
          icon={FileQuestion}
          title={t('editor.unreadableTitle')}
          description={t(`editor.unreadableText.${status.reason}`)}
        />
      )
  }
}
