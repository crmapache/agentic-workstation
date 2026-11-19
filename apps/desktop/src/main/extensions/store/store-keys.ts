import { newStoreKeys } from '@agentic-workstation/store-protocol/node-signer'
import type { StoreKeys } from '@agentic-workstation/store-protocol/node-signer'

import type { ExtensionSecrets } from '../extensions-service.types'

const PUBLIC = 'store:key:public'
const PRIVATE = 'store:key:private'

/**
 * Ключ этой IDE в магазине (ADR 0091): пара Ed25519 в хранилище ключей, заводится при первой
 * записи (публикация, установка, отзыв). Без шифрования хранилища ключа нет - и записи тоже:
 * закрытый ключ открытым текстом на диск не ложится.
 */
export const storeKeys = async (secrets: ExtensionSecrets): Promise<StoreKeys | null> => {
  const publicKey = secrets.get(PUBLIC)
  const privateKey = secrets.get(PRIVATE)

  if (publicKey && privateKey) return { publicKey, privateKey }

  const keys = newStoreKeys()

  try {
    await secrets.set(PRIVATE, keys.privateKey)
    await secrets.set(PUBLIC, keys.publicKey)
  } catch {
    return null
  }

  return keys
}

/** Открытый ключ без заведения нового: чьё расширение - моё ли. */
export const knownPublicKey = (secrets: ExtensionSecrets): string | null => secrets.get(PUBLIC)
