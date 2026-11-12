/**
 * Размер картинки вкладки для модели (ADR 0040). Картинка уходит в разговор как есть, и у API
 * есть пределы: сторона до 8000 пикселей, до 2000 - когда картинок в разговоре много, до 5 МБ
 * на картинку. Перерос предел - разговор ломается насовсем: каждая следующая реплика несёт ту
 * же картинку. На Retina (devicePixelRatio 2) видимая часть окна уже 2560 пикселей, а вся
 * страница - десятки тысяч. Поэтому длинная сторона картинки - не больше SHOT_MAX_SIDE
 * настоящих пикселей, а вся страница режется по высоте. Чистая функция - держит тест.
 */

/** Длинная сторона картинки в пикселях: предел API, когда картинок в разговоре много. */
export const SHOT_MAX_SIDE = 2000

/**
 * Вся страница - не выше стольких её ширин: длинную ленту, сжатую до 2000 пикселей, было бы
 * не прочесть. Остальное модель досмотрит прокруткой.
 */
export const FULL_PAGE_MAX_ASPECT = 2

/** base64 картинки длиннее - PNG пересъёмка в JPEG: предел API - 5 МБ на картинку. */
export const SHOT_MAX_BASE64 = 4.5 * 1024 * 1024

/** Качество JPEG по очереди, пока картинка не уложится в предел. */
export const JPEG_QUALITIES = [80, 60, 40] as const

export type Rect = { x: number; y: number; width: number; height: number }

export type ShotMetrics = {
  /** Видимая часть страницы в CSS-пикселях документа (cssVisualViewport). */
  viewport: Rect
  /** Вся страница в CSS-пикселях (cssContentSize). */
  content: { width: number; height: number }
  devicePixelRatio: number
}

export type ShotPlan = {
  clip: Rect & { scale: number }
  captureBeyondViewport: boolean
  /** Страница выше показанного: сколько CSS-пикселей сверху на картинке и сколько всего. */
  cut: { shown: number; total: number } | null
  /** Размер картинки в настоящих пикселях. */
  output: { width: number; height: number }
}

const atLeastOne = (value: number) => Math.max(1, Math.ceil(value))

/**
 * Что снимать и в каком масштабе: видимую часть или страницу сверху, с масштабом, при котором
 * длинная сторона с учётом devicePixelRatio не больше SHOT_MAX_SIDE.
 */
export const planScreenshot = (metrics: ShotMetrics, fullPage: boolean): ShotPlan => {
  const dpr = metrics.devicePixelRatio > 0 ? metrics.devicePixelRatio : 1
  const width = atLeastOne(fullPage ? metrics.content.width : metrics.viewport.width)
  const total = atLeastOne(fullPage ? metrics.content.height : metrics.viewport.height)
  const height = fullPage ? Math.min(total, atLeastOne(width * FULL_PAGE_MAX_ASPECT)) : total
  const scale = Math.min(1, SHOT_MAX_SIDE / (Math.max(width, height) * dpr))

  return {
    clip: {
      x: fullPage ? 0 : metrics.viewport.x,
      y: fullPage ? 0 : metrics.viewport.y,
      width,
      height,
      scale,
    },
    captureBeyondViewport: fullPage,
    cut: height < total ? { shown: height, total } : null,
    output: {
      width: Math.round(width * dpr * scale),
      height: Math.round(height * dpr * scale),
    },
  }
}
