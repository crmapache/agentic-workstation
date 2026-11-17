import type { ImageFile } from '../image-file.queries'

export type ImageViewProps = {
  projectId: string
  /** Картинка вкладки: путь от корня проекта или абсолютный (вне проекта). */
  path: string
}

/** Ширина и высота в пикселях CSS. */
export type Size = { width: number; height: number }

/** Масштаб: вписать в место (большая уменьшается, маленькая - своего размера) или доля. */
export type ImageZoom = 'fit' | number

/** Точка экрана, к которой привязан масштаб: курсор щипка или середина места. */
export type ScreenPoint = { clientX: number; clientY: number }

/** Точка под курсором до смены масштаба: где на экране и в какой доле картинки. */
export type ZoomAnchor = { x: number; y: number; partX: number; partY: number }

/** Почему вместо картинки - слова: чтение не удалось или файл не разжался (broken). */
export type ImageProblem = Exclude<ImageFile, { kind: 'image' }> | { kind: 'broken' }

export type ImageCanvasProps = {
  /** data URL картинки. */
  src: string
  /** Что на картинке для скринридера - имя файла. */
  alt: string
  /** Размер файла в байтах - в строке сведений. */
  bytes: number
  onBroken: () => void
}

export type ImageToolbarProps = {
  /** Настоящий размер картинки; null - ещё не разжалась. */
  natural: Size | null
  bytes: number
  zoom: ImageZoom
  /** Масштаб сейчас: у «вписать» - посчитанный. */
  scale: number
  onZoom: (direction: 1 | -1) => void
  onFit: () => void
  onActualSize: () => void
}

export type ImagePlaceholderProps = { problem: ImageProblem }
