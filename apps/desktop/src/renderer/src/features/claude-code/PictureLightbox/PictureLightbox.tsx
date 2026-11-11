import { useTranslation } from 'react-i18next'

import { Lightbox } from '@agentic-workstation/ui/Lightbox'

import { usePicture } from '../picture.queries'
import { useActiveProject } from '../../../state/workspace.queries'
import type { PictureLightboxProps } from './PictureLightbox.types'

/**
 * Картинка за чипом крупно - клик по чипу в ленте или очереди (как в ACC, где клик
 * открывает её в редакторе; редактор IDE картинок пока не показывает). Целиком, а не
 * уменьшенной копией превью; не нашлась - словами, а не вечным «грузится».
 */
export const PictureLightbox = ({ source, label, onClose }: PictureLightboxProps) => {
  const { t } = useTranslation()
  const projectId = useActiveProject()?.id ?? ''
  const look = usePicture(projectId, source, true, true)

  return (
    <Lightbox
      open
      src={look.state === 'ready' ? look.url : null}
      alt={label}
      loadingLabel={t('claudeCode.message.imageLoading')}
      error={look.state === 'missing' ? t('claudeCode.picture.missing') : undefined}
      closeLabel={t('claudeCode.message.closeImage')}
      onClose={onClose}
    />
  )
}
