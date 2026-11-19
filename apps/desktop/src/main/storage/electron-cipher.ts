import { safeStorage } from 'electron'

import type { VaultCipher } from './vault'

/** Шифр хранилищ секретов - safeStorage Electron: ключ в Keychain самой IDE, не провайдера. */
export const ELECTRON_CIPHER: VaultCipher = {
  available: () => safeStorage.isEncryptionAvailable(),
  encrypt: (text) => safeStorage.encryptString(text),
  decrypt: (data) => safeStorage.decryptString(data),
}
