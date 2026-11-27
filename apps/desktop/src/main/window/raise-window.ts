import { app } from 'electron'
import type { BrowserWindow } from 'electron'

import { IS_MAC, IS_WINDOWS } from '../platform'

/**
 * Вывести окно IDE вперёд из фона, без нажатия человека (ADR 0130). macOS не делает фоновое
 * приложение активным по focus() окна - только app.focus({ steal }). Windows отдаёт фокус лишь
 * тому, кто последним получал ввод, - moveTop поднимает окно над остальными, а фокус - как даст
 * система (живьём не проверено).
 */
export const raiseWindow = (window: BrowserWindow | null): void => {
  if (!window || window.isDestroyed()) return

  if (window.isMinimized()) window.restore()

  window.show()

  if (IS_MAC) app.focus({ steal: true })
  if (IS_WINDOWS) window.moveTop()

  window.focus()
}
