/**
 * Почему действие на компьютере не сделано: человек взял мышь, поставил паузу или остановил,
 * компьютер занят другим разговором, окно не принимает ввод (Windows, приложение от имени
 * администратора), нет разрешения macOS, нет снимка, вызов отменён.
 */
export type ComputerFailure =
  | 'interrupted'
  | 'paused'
  | 'stopped'
  | 'busy'
  | 'blocked'
  | 'no-access'
  | 'no-shot'
  | 'cancelled'
  | 'failed'

/** Ошибка, текст которой модель поймёт и по которой поступит: шлюз отдаёт его как ответ. */
export class ComputerError extends Error {
  constructor(
    readonly code: ComputerFailure,
    message: string,
  ) {
    super(message)
  }
}

/** Причина обрыва действия: её кладут в AbortController.abort, рука и стол её узнают. */
export const abortReason = (code: ComputerFailure, message: string) =>
  new ComputerError(code, message)

/** Обрыв сигнала - в понятную модели ошибку: своя причина как есть, чужая - «отменён». */
export const asComputerError = (signal: AbortSignal): ComputerError =>
  signal.reason instanceof ComputerError
    ? signal.reason
    : new ComputerError('cancelled', 'The call was cancelled.')
