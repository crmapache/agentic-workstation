import { safeStorage } from 'electron'

import type { Vault } from './remote-store'

/**
 * Хранилище секретов удалённого доступа - safeStorage Electron (на macOS - ключ в
 * Связке ключей). Недоступно - секреты живут в памяти, а экран говорит, что пара не
 * переживёт перезапуск.
 */
export const safeVault: Vault = {
  available: () => safeStorage.isEncryptionAvailable(),
  seal: (plain) => safeStorage.encryptString(plain.toString('base64')).toString('base64'),
  open: (sealed) => {
    try {
      return Buffer.from(safeStorage.decryptString(Buffer.from(sealed, 'base64')), 'base64')
    } catch {
      return null
    }
  },
}
