import type { EventChannel, EventPayload } from '@shared/ipc/contract'

import { ideWindows } from '../window/overlay-windows'

/** Отправляет событие из контракта во все окна IDE (накладные слушают только своё). */
export const broadcast = <E extends EventChannel>(event: E, payload: EventPayload<E>) => {
  for (const window of ideWindows()) window.webContents.send(event, payload)
}
