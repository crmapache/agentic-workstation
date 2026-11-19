import type { AddConnectorError } from '@shared/connectors'

import type { Vault } from '../storage/vault'
import type { NewConnector } from './connector-add'
import { SecretsOf, typeSecretsKey } from './connector-secrets'
import { signsInWithBrowser } from './kinds/sources'

/**
 * Почему готовый коннектор не добавить: вход в браузере и ключи без шифрования не сохранить,
 * Gmail и Calendar без своего клиента Google не войдут. null - можно.
 */
export const addRefusal = (
  { connector, secrets }: NewConnector,
  vault: Vault,
  hasGoogleClient: boolean,
): AddConnectorError | null => {
  const hasSecrets = Object.keys(secrets).length > 0

  if ((signsInWithBrowser(connector) || hasSecrets) && !vault.available) return 'vault-unavailable'

  if ((connector.kind === 'gmail' || connector.kind === 'calendar') && !hasGoogleClient) {
    return 'google-app-missing'
  }

  return null
}

/** Секреты подключения и образца его типа - в хранилище, до записи в реестр. */
export const storeSecrets = async ({ connector, secrets, type }: NewConnector, vault: Vault) => {
  if (Object.keys(secrets).length) await new SecretsOf(vault, connector.id).update(secrets)

  if (type && Object.keys(type.secrets).length) {
    await new SecretsOf(vault, type.stored.id, typeSecretsKey(type.stored.id)).update(type.secrets)
  }
}
