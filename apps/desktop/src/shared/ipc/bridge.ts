import type {
  EventChannel,
  EventPayload,
  InvokeChannel,
  InvokeRequest,
  InvokeResponse,
} from './contract'

/**
 * То, что preload выставляет окну в window.ide. Окно напрямую им не пользуется -
 * только через lib/ipc.ts, где поверх этого типизированные обёртки.
 */
export type IdeBridge = {
  invoke: <C extends InvokeChannel>(
    channel: C,
    request: InvokeRequest<C>,
  ) => Promise<InvokeResponse<C>>
  /** Подписка на событие. Возвращает функцию отписки - её обязательно звать. */
  on: <E extends EventChannel>(event: E, listener: (payload: EventPayload<E>) => void) => () => void
  /**
   * Путь на диске у файла, перетащенного из Finder (webUtils.getPathForFile): песочница
   * окна его не видит. Пусто - у файла нет пути (вставлен байтами из буфера).
   */
  pathForFile: (file: File) => string
  /**
   * Платформа (`process.platform`): darwin или win32. Окну она нужна сразу, до первого ответа
   * главного процесса: клавиши (⌘ или Ctrl), их подписи и место под кнопки окна (ADR 0048).
   */
  platform: string
}
