import qrcode from 'qrcode-generator'

import { QR_CELL, QR_MARGIN } from './RemoteModal.constants'

/**
 * QR кода пары картинкой (SVG в data URL): вектор не размывается при любом масштабе окна, а
 * белая тихая зона - часть самой картинки. Уровень M переживает блик и шум камеры, не делая код
 * заметно плотнее.
 */
export const qrDataUrl = (value: string): string => {
  const code = qrcode(0, 'M')

  code.addData(value)
  code.make()

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    code.createSvgTag({ cellSize: QR_CELL, margin: QR_MARGIN }),
  )}`
}

/** Сколько код ещё работает - «2:41»; истёк - «0:00». */
export const countdown = (expiresAt: number, now: number): string => {
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000))

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Когда телефон был на связи - коротко, по часам этой машины. */
export const seenAt = (at: number, locale?: string): string =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(at)
