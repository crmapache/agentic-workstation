import clsx from 'clsx'

import { PIXELATED_FROM } from '../ImageView.constants'
import { useImageZoom } from '../ImageView.hooks'
import styles from '../ImageView.module.scss'
import type { ImageCanvasProps } from '../ImageView.types'
import { ImageToolbar } from './ImageToolbar'

/**
 * Картинка на листе со своей прокруткой: вписана в место, крупнее места - прокручивается.
 * Масштаб и панель над листом - useImageZoom. Пока картинка не разжалась и место не
 * измерено, её не видно: иначе мигнула бы своим размером до того, как впишется.
 */
export const ImageCanvas = ({ src, alt, bytes, onBroken }: ImageCanvasProps) => {
  const {
    scrollRef,
    imageRef,
    zoom,
    scale,
    natural,
    isMeasured,
    handleLoad,
    handleDoubleClick,
    handleZoom,
    handleFit,
    handleActualSize,
  } = useImageZoom()

  return (
    <div className={styles.canvas}>
      <div ref={scrollRef} className={styles.scroll}>
        <img
          ref={imageRef}
          className={clsx(
            styles.image,
            !isMeasured && styles.measuring,
            scale >= PIXELATED_FROM && styles.pixelated,
          )}
          src={src}
          alt={alt}
          draggable={false}
          // eslint-disable-next-line no-restricted-syntax -- размер следует за масштабом на лету
          style={
            natural ? { width: natural.width * scale, height: natural.height * scale } : undefined
          }
          onLoad={handleLoad}
          onError={onBroken}
          onDoubleClick={handleDoubleClick}
        />
      </div>
      <ImageToolbar
        natural={natural}
        bytes={bytes}
        zoom={zoom}
        scale={scale}
        onZoom={handleZoom}
        onFit={handleFit}
        onActualSize={handleActualSize}
      />
    </div>
  )
}
