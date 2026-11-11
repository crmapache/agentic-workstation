import { useTranslation } from 'react-i18next'

import { Lightbox } from '@agentic-workstation/ui/Lightbox'

import { useProblemText } from '../MarkdownPreview.hooks'
import type { ImageLightboxProps } from '../MarkdownPreview.types'
import { usePreviewImage } from '../../markdown-preview.queries'

const NO_PROBLEM = { kind: 'hidden' } as const

/**
 * Картинка проекта крупно поверх окна - по ссылке на неё в просмотре (кликабельный
 * скриншот README): редактор картинок не показывает, вкладка открылась бы пустой.
 */
export const ImageLightbox = ({ projectId, path, onClose }: ImageLightboxProps) => {
  const { t } = useTranslation()
  const { data } = usePreviewImage(projectId, path)
  const problem = data && data.kind !== 'image' ? data : null
  const error = useProblemText(problem ?? NO_PROBLEM)

  return (
    <Lightbox
      open
      src={data?.kind === 'image' ? data.data : null}
      alt={path}
      loadingLabel={t('editor.markdown.lightbox.loading')}
      error={problem ? (error ?? undefined) : undefined}
      closeLabel={t('editor.markdown.lightbox.close')}
      onClose={onClose}
    />
  )
}
