import { useState } from 'react'

import { useImageFile } from '../image-file.queries'
import { baseName } from '../../../lib/path.utils'
import { useCloseWhenGone, useWatchOutsideImage } from './ImageView.hooks'
import type { ImageViewProps } from './ImageView.types'
import { ImageCanvas } from './parts/ImageCanvas'
import { ImagePlaceholder } from './parts/ImagePlaceholder'

/**
 * Вкладка картинки (PNG, JPEG, GIF, WebP…) - сама картинка, а не «не текст»: файл проекта или
 * вне проекта, без Monaco. Перерисовывается, когда файл меняется на диске; нет её - почему.
 * SVG - текст и открывается кодом.
 */
export const ImageView = ({ projectId, path }: ImageViewProps) => {
  const { data } = useImageFile(projectId, path, { live: true })
  // Помнится именно этот адрес: перезаписанный файл с годной картинкой - уже не битый.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null)

  useWatchOutsideImage(projectId, path)
  useCloseWhenGone(projectId, path, data)

  const src = data?.kind === 'image' ? data.data : null

  const handleBroken = () => setBrokenSrc(src)

  if (!data) return null
  if (data.kind !== 'image') return <ImagePlaceholder problem={data} />
  if (brokenSrc === data.data) return <ImagePlaceholder problem={{ kind: 'broken' }} />

  return (
    <ImageCanvas src={data.data} alt={baseName(path)} bytes={data.size} onBroken={handleBroken} />
  )
}
