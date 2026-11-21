import { dialog, clipboard } from 'electron'
import type { BrowserWindow, MessageBoxOptions } from 'electron'

/**
 * Системные окна облака (ADR 0102). Ключ аккаунта показывает главный процесс, а не окно IDE:
 * окно его не видит никогда. Смена аккаунта - только после «да» человека здесь: окно, которое
 * сломали, не уведёт доски под чужой ключ. Тексты - по-английски, как весь интерфейс.
 */

/** Сколько ключ живёт в буфере обмена, если человек его не перезаписал. */
const CLIPBOARD_LIFE_MS = 60_000

const show = (window: BrowserWindow | null, options: MessageBoxOptions) =>
  window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options)

/** Стереть ключ из буфера, если человек за минуту не положил туда своё. */
const clearIfStill = async (key: string) => {
  try {
    if ((await clipboard.readText()) === key) clipboard.clear()
  } catch (error) {
    console.warn('[cloud] буфер обмена не очистился', error)
  }
}

/** Показать ключ аккаунта; «Copy» кладёт его в буфер на минуту. true - скопировал. */
export const revealAccountKey = async (
  getWindow: () => BrowserWindow | null,
  key: string,
): Promise<boolean> => {
  const { response } = await show(getWindow(), {
    type: 'info',
    message: 'Your cloud account key',
    detail: `${key}\n\nKeep it in a password manager. It is the only way to your boards: enter it on another computer under Use another key. The copy is cleared from the clipboard in a minute.`,
    buttons: ['Copy', 'Close'],
    defaultId: 0,
    cancelId: 1,
  })

  if (response !== 0) return false

  await clipboard.writeText(key)
  setTimeout(() => {
    void clearIfStill(key)
  }, CLIPBOARD_LIFE_MS).unref()

  return true
}

/** Спросить, переходить ли на другой аккаунт облака. from null - прежнего ключа нет. */
export const confirmAccountSwitch = async (
  getWindow: () => BrowserWindow | null,
  from: string | null,
  to: string,
): Promise<boolean> => {
  const { response } = await show(getWindow(), {
    type: 'warning',
    message: from ? 'Switch to another cloud account?' : 'Start a new cloud account?',
    detail: from
      ? `Boards on this computer will join account ${to} and sync with it. Account ${from} stays in the cloud; its key is kept on this computer.`
      : `Boards on this computer will be uploaded to the new account ${to}. Save its key afterwards.`,
    buttons: [from ? 'Switch' : 'Start', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  })

  return response === 0
}
