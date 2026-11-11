import type { OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthTokens,
  OAuthClientInformationMixed,
} from '@modelcontextprotocol/sdk/shared/auth.js'

import type { Vault } from './vault'
import type { GoogleTokens } from './oauth/google-oauth'

/** Всё секретное одного коннектора. Какие поля есть, зависит от типа. */
export type ConnectorSecrets = {
  /** Вход в MCP-сервер по OAuth (Notion, Slack, свой). */
  tokens?: OAuthTokens
  /** Когда токены сохранены, мс с эпохи: срок у них относительный (expires_in). */
  tokensSavedAt?: number
  /** Клиент OAuth у сервера: зарегистрированный сам (Notion) или Slack app человека. */
  client?: OAuthClientInformationMixed
  /** Где у сервера вход: чтобы не искать адреса заново на каждом обновлении токена. */
  discovery?: OAuthDiscoveryState
  /** Ключ своего MCP-сервера для заголовка Authorization. */
  bearer?: string
  /** Полный адрес своего MCP, когда в нём ключ (?api_key=…): в реестре - только без него. */
  url?: string
  /** Свои заголовки MCP по адресу (X-API-Key и подобные) - из импорта конфига Claude Code. */
  headers?: Record<string, string>
  /** Переменные окружения MCP-команды: в них обычно ключи сервера. */
  env?: Record<string, string>
  /** Полная команда, когда в её аргументах ключ (--api-key …): в реестре - замаскированная. */
  command?: { command: string; args: string[] }
  /** Ключ коннектора, описанного ИИ: токен, значение заголовка или пароль Basic. */
  apiKey?: string
  /** Логин Basic коннектора, описанного ИИ. */
  basicUser?: string
  /** Вход Google (Gmail, Calendar). */
  google?: GoogleTokens
}

/** Правка секретов: поле с undefined - удалить. */
export type SecretsPatch = { [K in keyof ConnectorSecrets]?: ConnectorSecrets[K] | undefined }

const KEY_PREFIX = 'connector:'

/** Ключ хранилища для коннектора: по нему же секреты удаляются целиком. */
export const secretsKey = (id: string): string => `${KEY_PREFIX}${id}`

/**
 * Ключ хранилища для своего типа (ADR 0034): секреты образца, которые копирует каждое новое
 * подключение. Начало другое, чем у коннекторов: удаление коннектора по началу ключа
 * (forgetPrefix) тип не заденет.
 */
export const typeSecretsKey = (id: string): string => `connector-type:${id}`

/**
 * Чем работает подключение - а не как оно вошло: ключ в адресе, заголовки, окружение и
 * команда с ключом. Это у подключений одного своего типа общее; вход (токены, ключ,
 * логин) у каждого свой.
 */
export const DEFINITION_SECRETS = ['url', 'headers', 'env', 'command'] as const

/** Секреты того, чем работает подключение, - для образца своего типа. */
export const definitionSecrets = (secrets: ConnectorSecrets): ConnectorSecrets =>
  Object.fromEntries(
    DEFINITION_SECRETS.flatMap((key) => (secrets[key] === undefined ? [] : [[key, secrets[key]]])),
  )

/**
 * Секреты одного коннектора (или образца своего типа - key) в общем хранилище: одна запись
 * JSON. Читается каждый раз заново из памяти хранилища - копий, которые разойдутся, нет.
 */
export class SecretsOf {
  constructor(
    private readonly vault: Vault,
    id: string,
    private readonly key = secretsKey(id),
  ) {}

  read(): ConnectorSecrets {
    const raw = this.vault.get(this.key)

    if (!raw) return {}

    try {
      return JSON.parse(raw) as ConnectorSecrets
    } catch {
      return {}
    }
  }

  /** Поменять поля; поле со значением undefined удаляется. */
  async update(patch: SecretsPatch): Promise<void> {
    // Поле с undefined JSON не пишет - оно просто пропадает из записи.
    const next = JSON.stringify({ ...this.read(), ...patch })

    await this.vault.set(this.key, next === '{}' ? null : next)
  }

  forget(): Promise<void> {
    return this.vault.set(this.key, null)
  }
}
