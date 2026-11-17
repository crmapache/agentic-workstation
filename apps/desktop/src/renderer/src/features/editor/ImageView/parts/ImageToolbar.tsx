import { Expand, Shrink, ZoomIn, ZoomOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { ZOOM_MAX, ZOOM_MIN } from '../ImageView.constants'
import styles from '../ImageView.module.scss'
import type { ImageToolbarProps } from '../ImageView.types'
import { formatBytes, zoomPercent } from '../ImageView.utils'

/**
 * Плавающая панель картинки в правом верхнем углу, как у вида Markdown: размер картинки и
 * файла, масштаб, «мельче / крупнее», «вписать» и «свой размер». Приглушена, чтобы не
 * закрывать картинку, под курсором - в полную силу.
 */
export const ImageToolbar = ({
  natural,
  bytes,
  zoom,
  scale,
  onZoom,
  onFit,
  onActualSize,
}: ImageToolbarProps) => {
  const { t } = useTranslation()

  const handleZoomOut = () => onZoom(-1)

  const handleZoomIn = () => onZoom(1)

  return (
    <div role="toolbar" aria-label={t('editor.image.toolbar')} className={styles.toolbar}>
      <span className={styles.info}>
        {natural
          ? t('editor.image.info', {
              width: natural.width,
              height: natural.height,
              size: formatBytes(bytes),
            })
          : formatBytes(bytes)}
      </span>
      <span className={styles.separator} aria-hidden />
      <IconButton
        icon={ZoomOut}
        size="sm"
        label={t('editor.image.zoomOut')}
        disabled={scale <= ZOOM_MIN}
        tooltipPlacement="bottom"
        onClick={handleZoomOut}
      />
      <span className={styles.percent} aria-live="polite">
        {zoomPercent(scale)}
      </span>
      <IconButton
        icon={ZoomIn}
        size="sm"
        label={t('editor.image.zoomIn')}
        disabled={scale >= ZOOM_MAX}
        tooltipPlacement="bottom"
        onClick={handleZoomIn}
      />
      <span className={styles.separator} aria-hidden />
      <IconButton
        icon={Shrink}
        size="sm"
        label={t('editor.image.fit')}
        active={zoom === 'fit'}
        tooltipPlacement="bottom"
        onClick={onFit}
      />
      <IconButton
        icon={Expand}
        size="sm"
        label={t('editor.image.actualSize')}
        active={zoom === 1}
        tooltipPlacement="bottom"
        onClick={onActualSize}
      />
    </div>
  )
}
