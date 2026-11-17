/** Как часто читать кадр: код находится за доли секунды, а телефон не греется разбором каждого кадра. */
export const SCAN_INTERVAL_MS = 200

/**
 * Длинная сторона кадра для разбора, в точках. QR с экрана ноутбука в видоискателе крупный и
 * читается и так, а разбор полного кадра камеры в разы дольше.
 */
export const FRAME_MAX = 960

/** Задняя камера (на ноутбуке - какая есть), кадр побольше: QR с полуметра мелковат. */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
}
