import { app, dialog } from 'electron'
import type { BrowserWindow, OpenDialogOptions } from 'electron'

/**
 * Системный выбор файла клиента OAuth Google (client_secret_….json). Начинает с «Загрузок»:
 * Cloud Console отдаёт файл туда. Отмена - null.
 */
export const pickGoogleClientFile = async (
  window: BrowserWindow | null,
): Promise<string | null> => {
  const options: OpenDialogOptions = {
    title: 'Google OAuth client file',
    defaultPath: app.getPath('downloads'),
    properties: ['openFile'],
    filters: [{ name: 'OAuth client', extensions: ['json'] }],
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)

  return result.canceled ? null : (result.filePaths[0] ?? null)
}
