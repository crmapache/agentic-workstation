import { screen, desktopCapturer } from 'electron'
import type { NativeImage } from 'electron'

import { IS_WINDOWS } from '../platform'
import { ComputerError } from './computer-error'
import { shotSize } from './computer-geometry'
import type { Rect, Display, ShotFrame } from './computer-geometry'
import { SHOT_JPEG_QUALITY, SHOT_MAX_PNG_BASE64 } from './computer.constants'

/** Картинка для модели: base64 и тип. */
export type Picture = { data: string; mimeType: 'image/png' | 'image/jpeg' }

export type Shot = Picture & { frame: ShotFrame }

const NO_PICTURE = IS_WINDOWS
  ? 'Windows gave an empty picture of the screen (the screen may be locked). Ask the user to ' +
    'unlock it.'
  : 'macOS gave an empty picture of the screen: the IDE has no Screen Recording permission. ' +
    'Ask the user to allow it in Agentic Workstation → Connectors → Computer Use.'

/** Дисплеи в точках macOS, главный - отмечен. */
export const listDisplays = (): Display[] => {
  const main = screen.getPrimaryDisplay().id

  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    bounds: display.bounds,
    scaleFactor: display.scaleFactor,
    isMain: display.id === main,
  }))
}

/**
 * Снимок дисплея нужного размера. desktopCapturer снимает все дисплеи разом - берём свой по
 * id; без разрешения «Запись экрана» macOS отдаёт пустые картинки.
 */
const grab = async (display: Display, size: { width: number; height: number }) => {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size })
  const source =
    sources.find((one) => one.display_id === String(display.id)) ??
    // Без id источник бывает только у единственного экрана; чужой экран вместо пропавшего -
    // никогда.
    (sources.length === 1 && !sources[0]?.display_id ? sources[0] : undefined)

  if (!source) {
    throw new ComputerError('no-shot', 'That display is gone. Take a new screenshot.')
  }

  if (source.thumbnail.isEmpty()) throw new ComputerError('no-access', NO_PICTURE)

  return source.thumbnail
}

/** PNG, пока он не тяжёлый; рабочий стол с фотографией - JPEG. */
const encode = (image: NativeImage): Picture => {
  const png = image.toPNG().toString('base64')

  if (png.length <= SHOT_MAX_PNG_BASE64) return { data: png, mimeType: 'image/png' }

  return { data: image.toJPEG(SHOT_JPEG_QUALITY).toString('base64'), mimeType: 'image/jpeg' }
}

/** Снимок дисплея для модели: размер - shotSize, координаты действий - его пиксели. */
export const shootDisplay = async (display: Display): Promise<Shot> => {
  const image = await grab(display, shotSize(display.bounds))
  const { width, height } = image.getSize()

  return { ...encode(image), frame: { display, width, height } }
}

/**
 * Подробный снимок области дисплея: в полной плотности экрана (мелкий текст читается), не
 * крупнее предела снимка.
 */
export const shootRegion = async (display: Display, region: Rect): Promise<Picture> => {
  const { bounds, scaleFactor } = display
  const image = await grab(display, {
    width: Math.round(bounds.width * scaleFactor),
    height: Math.round(bounds.height * scaleFactor),
  })
  const scale = image.getSize().width / bounds.width
  const crop = image.crop({
    x: Math.round((region.x - bounds.x) * scale),
    y: Math.round((region.y - bounds.y) * scale),
    width: Math.max(1, Math.round(region.width * scale)),
    height: Math.max(1, Math.round(region.height * scale)),
  })

  if (crop.isEmpty()) {
    throw new ComputerError('no-shot', 'That region is outside the display. Take a new screenshot.')
  }

  const size = crop.getSize()
  const fit = shotSize({ x: 0, y: 0, ...size })

  return encode(fit.width < size.width ? crop.resize({ ...fit, quality: 'best' }) : crop)
}
