import type { CameraProblem } from './QrCamera.types'

/** Размер кадра для разбора: длинная сторона не больше max, пропорции те же, мелкий не растягивается. */
export const frameSize = (
  width: number,
  height: number,
  max: number,
): { width: number; height: number } => {
  const scale = Math.min(1, max / Math.max(width, height))

  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * Что с камерой - по имени ошибки getUserMedia. Имя читается с самого объекта, а не через
 * instanceof: DOMException не везде наследует Error.
 */
export const cameraProblemOf = (error: unknown): CameraProblem => {
  const name =
    typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string'
      ? error.name
      : ''

  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'missing'
    case 'NotReadableError':
      return 'busy'
    default:
      return 'failed'
  }
}
