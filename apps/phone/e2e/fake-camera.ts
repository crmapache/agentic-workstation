import type { Page } from 'playwright-core'
import qrcode from 'qrcode-generator'

/** Клетки QR так же, как их рисует окно Remote Control (RemoteModal.utils): уровень M. */
const modulesOf = (text: string): boolean[][] => {
  const code = qrcode(0, 'M')

  code.addData(text)
  code.make()

  const count = code.getModuleCount()

  return Array.from({ length: count }, (_, row) =>
    Array.from({ length: count }, (_, column) => code.isDark(row, column)),
  )
}

/**
 * Навести камеру телефона на QR с текстом. Подменён только датчик: getUserMedia страницы отдаёт
 * поток холста, на котором код стоит посреди серого стола; видео, кадр и разбор jsQR - настоящие.
 * Повторный вызов меняет код в том же потоке - как другой экран перед камерой.
 */
export const pointCameraAt = (page: Page, text: string) =>
  page.evaluate((modules) => {
    const scope = window as unknown as { fakeQr?: boolean[][]; fakeCamera?: MediaStream }

    scope.fakeQr = modules

    if (scope.fakeCamera) return

    const canvas = document.createElement('canvas')

    canvas.width = 720
    canvas.height = 1280

    const context = canvas.getContext('2d')

    if (!context) throw new Error('no 2d canvas for the fake camera')

    const paint = () => {
      const qr = scope.fakeQr ?? []
      // Тихая зона в 4 клетки, как у QR в IDE.
      const cell = Math.floor(480 / (qr.length + 8))
      const left = (canvas.width - cell * qr.length) / 2
      const top = (canvas.height - cell * qr.length) / 2

      context.fillStyle = 'gray'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = 'white'
      context.fillRect(
        left - cell * 4,
        top - cell * 4,
        cell * (qr.length + 8),
        cell * (qr.length + 8),
      )
      context.fillStyle = 'black'
      qr.forEach((row, y) =>
        row.forEach((dark, x) => {
          if (dark) context.fillRect(left + x * cell, top + y * cell, cell, cell)
        }),
      )
    }

    paint()
    // Поток холста отдаёт кадр только на перерисовке: рисуем постоянно, как живая камера.
    window.setInterval(paint, 100)
    scope.fakeCamera = canvas.captureStream(10)

    const camera = scope.fakeCamera

    // Экран гасит дорожки, уходя: каждому вызову - своя копия потока.
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: () => Promise.resolve(camera.clone()),
    })
  }, modulesOf(text))
