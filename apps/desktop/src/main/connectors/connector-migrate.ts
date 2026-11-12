import { randomUUID } from 'node:crypto'

import { isCustomKind } from '@shared/connectors'

import { commandForStore } from './connector-command'
import type { ConnectorRegistry } from './connector-registry'
import { SecretsOf, typeSecretsKey, definitionSecrets } from './connector-secrets'
import type { StoredConnector } from './connector-store'
import { planTypes } from './connector-types'
import { publicUrl } from './connector-url'
import type { Vault } from './vault'
import { asPlaywright } from './kinds/playwright'

/**
 * Реестр прежних версий: ключ в аргументах команды или в пути адреса лежал в нём открытым
 * текстом. Он переезжает в хранилище, в реестре остаётся маска. Без шифрования ничего не
 * трогается: стереть ключ из реестра, не сохранив его, значило бы сломать коннектор.
 */
export const moveSecretsToVault = async (registry: ConnectorRegistry, vault: Vault) => {
  if (!vault.available) return

  for (const connector of registry.connectors) {
    const secrets = new SecretsOf(vault, connector.id)
    const { command, url } = connector

    if (connector.kind === 'command' && command) {
      const { stored, secret } = commandForStore(command, command, command.cwd)

      if (secret) {
        if (!secrets.read().command) await secrets.update({ command: secret })

        await registry.update(connector.id, { command: stored })
      }
    }

    if (connector.kind === 'mcp' && url && publicUrl(url) !== url) {
      if (!secrets.read().url) await secrets.update({ url })

      await registry.update(connector.id, { url: publicUrl(url) })
    }
  }
}

/**
 * Реестр до ADR 0034: у своих коннекторов не было типа. Они его получают (planTypes),
 * секреты того, чем работает первый коннектор типа, становятся образцом. Одной записью
 * реестра: наполовину перенесённым он на диске не останется. Без шифрования секреты не
 * сравниваются и не копируются: одинаковые по реестру команды с разными ключами тогда
 * сольются в тип, но каждый коннектор работает со своими секретами, как и раньше.
 */
export const assignCustomTypes = async (
  registry: ConnectorRegistry,
  vault: Vault,
  newId: () => string,
) => {
  const loose = registry.connectors.filter(
    (connector) => isCustomKind(connector.kind) && !connector.typeId,
  )

  if (!loose.length) return

  const secretsOf = (id: string) => (vault.available ? new SecretsOf(vault, id).read() : {})
  const definition = (connector: StoredConnector) =>
    JSON.stringify([
      connector.kind,
      connector.url,
      connector.auth,
      connector.transport,
      connector.command,
      connector.spec,
      definitionSecrets(secretsOf(connector.id)),
    ])
  const plan = planTypes(loose, definition, newId)

  for (const [typeId, connectorId] of plan.secretsFrom) {
    const secrets = definitionSecrets(secretsOf(connectorId))

    if (Object.keys(secrets).length) {
      await new SecretsOf(vault, typeId, typeSecretsKey(typeId)).update(secrets)
    }
  }

  await registry.reshape({ types: plan.types, patches: plan.patches })
}

/**
 * Свои команды, которые на деле Playwright MCP, становятся встроенным Playwright (ADR 0035,
 * asPlaywright). Свой тип, у которого после этого не осталось подключений, уходит вместе с
 * образцом. Без шифрования секретов команды не узнать - перенос ждёт следующего запуска.
 */
export const adoptPlaywright = async (registry: ConnectorRegistry, vault: Vault) => {
  if (!vault.available) return

  const patches = new Map<string, StoredConnector>()

  for (const connector of registry.connectors) {
    const adopted = asPlaywright(connector, new SecretsOf(vault, connector.id).read())

    if (adopted) patches.set(connector.id, adopted)
  }

  if (!patches.size) return

  const dropTypes = new Set(
    [...patches.values()]
      .map((connector) => registry.find(connector.id)?.typeId ?? null)
      .filter((typeId): typeId is string => typeId !== null)
      .filter((typeId) =>
        registry.connectionsOf(typeId).every((connector) => patches.has(connector.id)),
      ),
  )

  await registry.reshape({ dropTypes, patches })

  for (const typeId of dropTypes) {
    await vault.forgetPrefix(typeSecretsKey(typeId)).catch(() => undefined)
  }
}

/**
 * Все переносы прежнего реестра при загрузке, по порядку: ключи - в хранилище, своя команда
 * Playwright - встроенным Playwright (ADR 0035), остальные свои коннекторы - своими типами
 * (ADR 0034). Сбой одного переноса не мешает следующим и загрузке.
 */
export const migrateRegistry = async (registry: ConnectorRegistry, vault: Vault) => {
  await moveSecretsToVault(registry, vault).catch((error: unknown) => {
    console.warn('[connectors] ключи из реестра не перенесены в хранилище', error)
  })
  await adoptPlaywright(registry, vault).catch((error: unknown) => {
    console.warn('[connectors] команды Playwright не перенесены', error)
  })
  await assignCustomTypes(registry, vault, randomUUID).catch((error: unknown) => {
    console.warn('[connectors] свои коннекторы не получили типы', error)
  })
}
