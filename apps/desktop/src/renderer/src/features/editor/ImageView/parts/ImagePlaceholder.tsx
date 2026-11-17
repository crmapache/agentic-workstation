import { ImageOff, FileMinus, FileWarning, FileQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import type { ImagePlaceholderProps } from '../ImageView.types'
import { formatSize } from '../../editor.utils'

/**
 * Вместо картинки - почему её нет, теми же словами, что у кода: файла нет на диске, слишком
 * большой, не прочитался. Своё - только у файла, который не разжался в картинку.
 */
export const ImagePlaceholder = ({ problem }: ImagePlaceholderProps) => {
  const { t } = useTranslation()

  switch (problem.kind) {
    case 'missing':
      return (
        <EmptyState
          icon={FileMinus}
          title={t('editor.missingTitle')}
          description={t('editor.missingText')}
        />
      )
    case 'tooLarge':
      return (
        <EmptyState
          icon={FileWarning}
          title={t('editor.tooLargeTitle')}
          description={t('editor.tooLargeText', {
            size: formatSize(problem.size),
            limit: formatSize(problem.limit),
          })}
        />
      )
    case 'failed':
      return (
        <EmptyState
          icon={FileQuestion}
          title={t('editor.unreadableTitle')}
          description={t(`editor.unreadableText.${problem.reason}`)}
        />
      )
    case 'notImage':
    case 'broken':
      return (
        <EmptyState
          icon={ImageOff}
          title={t('editor.image.brokenTitle')}
          description={t('editor.image.brokenText')}
        />
      )
  }
}
