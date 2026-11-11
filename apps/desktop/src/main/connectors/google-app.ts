import { readFile } from 'node:fs/promises'

import type { GoogleAppError, GoogleAppState } from '@shared/connectors'

import type { Vault } from './vault'
import { parseGoogleClientFile } from './oauth/google-oauth'
import type { GoogleClient } from './oauth/google-oauth'

const SECRET_KEY = 'google:clientSecret'

/** Сколько знаков конца идентификатора показать человеку: узнать свой клиент. */
const HINT_LENGTH = 12

/**
 * Свой клиент OAuth Google владельца: один на все Gmail и Calendar. Идентификатор лежит в
 * реестре, ключ - в хранилище секретов. Клиента создаёт человек в Cloud Console («приложение
 * на компьютере») и отдаёт IDE скачанным файлом: API для создания таких клиентов у Google нет.
 */
export class GoogleApp {
  constructor(
    private readonly vault: Vault,
    private clientId: string | null,
    private readonly persist: (clientId: string | null) => Promise<void>,
  ) {}

  client(): GoogleClient | null {
    const clientSecret = this.vault.get(SECRET_KEY)

    return this.clientId && clientSecret ? { clientId: this.clientId, clientSecret } : null
  }

  state(): GoogleAppState {
    return {
      configured: this.client() !== null,
      clientHint: this.clientId
        ? `…${this.clientId.split('.')[0]?.slice(-HINT_LENGTH) ?? ''}`
        : null,
    }
  }

  /** Взять клиент из файла Cloud Console. Не вышло - причина кодом, вышло - null. */
  async importFile(path: string): Promise<GoogleAppError | null> {
    let parsed: unknown

    try {
      parsed = JSON.parse(await readFile(path, 'utf8'))
    } catch {
      return 'bad-file'
    }

    const client = parseGoogleClientFile(parsed)

    if (client === null) return 'bad-file'

    if (client === 'not-desktop-client') return client

    if (!this.vault.available) return 'vault-unavailable'

    await this.vault.set(SECRET_KEY, client.clientSecret)
    this.clientId = client.clientId
    await this.persist(client.clientId)

    return null
  }

  async forget(): Promise<void> {
    this.clientId = null
    await this.persist(null)

    if (this.vault.available) await this.vault.set(SECRET_KEY, null)
  }
}
