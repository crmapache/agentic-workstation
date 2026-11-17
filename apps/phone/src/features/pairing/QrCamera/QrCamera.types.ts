/**
 * Почему камеры нет: от этого зависит, что сказать человеку и есть ли смысл в «Try again».
 * unsupported - у страницы нет доступа к камере вовсе (не HTTPS или старый браузер).
 */
export type CameraProblem = 'denied' | 'missing' | 'busy' | 'failed' | 'unsupported'

export type CameraState =
  { kind: 'starting' } | { kind: 'live' } | { kind: 'problem'; problem: CameraProblem }

export type QrCameraProps = {
  /** Прочитанный QR - текстом, как есть; что это за код, решает экран. Тот же текст дважды не приходит. */
  onText: (text: string) => void
  /** Строка под видоискателем: последний прочитанный код не подошёл. */
  notice?: string | null | undefined
}
