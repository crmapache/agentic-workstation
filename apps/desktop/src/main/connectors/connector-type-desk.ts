import { randomUUID } from 'node:crypto'

import type {
  AddToTypeRequest,
  AddConnectorError,
  UpdateTypeRequest,
  AddConnectorOutcome,
} from '@shared/connectors'

import { newConnection } from './connector-add'
import type { NewConnector } from './connector-add'
import type { ConnectorRegistry } from './connector-registry'
import { SecretsOf, typeSecretsKey } from './connector-secrets'
import { capitalized } from './connector-types'
import type { Vault } from './vault'

type TypeDeskDeps = {
  registry: ConnectorRegistry
  vault: Vault
  /** Имя сервера, у которого поменялось пояснение модели: живые разговоры переподключат его. */
  serverChanged: (serverName: string) => void
  /** Удалить подключение целиком - как кнопкой человека. */
  remove: (id: string) => Promise<unknown>
  /** Готовое подключение - в реестр, окну и ко входу; отказ - кодом. */
  addOutcome: (result: NewConnector | AddConnectorError) => Promise<AddConnectorOutcome>
}

/**
 * Свои типы коннекторов (ADR 0034): ещё одно подключение по образцу, имя и «несколько раз»,
 * удаление типа вместе с подключениями. Секреты образца - в хранилище под ключом типа.
 */
export class ConnectorTypeDesk {
  constructor(private readonly deps: TypeDeskDeps) {}

  /** Ещё одно подключение своего типа «несколько раз»: копия образца, свой вход. */
  addToType(request: AddToTypeRequest): Promise<AddConnectorOutcome> {
    const { registry, vault } = this.deps
    const type = registry.findType(request.typeId)
    const typeSecrets = type ? new SecretsOf(vault, type.id, typeSecretsKey(type.id)) : null

    return this.deps.addOutcome(
      type && typeSecrets
        ? newConnection(type, typeSecrets.read(), request, randomUUID(), registry.serverNames())
        : 'failed',
    )
  }

  /** Тип из каталога вместе с подключениями: без типа у них не было бы ни имени, ни образца. */
  async remove(typeId: string): Promise<void> {
    for (const connector of this.deps.registry.connectionsOf(typeId)) {
      await this.deps.remove(connector.id)
    }

    await this.forget(typeId)
  }

  /**
   * Имя и «несколько раз». Имена серверов не меняются: на них опираются правила и хуки
   * человека. «Один раз» - только пока подключений не больше одного. Имя - в пояснении модели:
   * живые разговоры переподключают серверы типа. false - менять нечего.
   */
  async update({ typeId, name, multiple }: UpdateTypeRequest): Promise<boolean> {
    const { registry } = this.deps
    const type = registry.findType(typeId)

    if (!type) return false

    const connections = registry.connectionsOf(typeId)
    const nextName = name === undefined ? '' : capitalized(name)
    const patch = {
      ...(nextName && nextName !== type.name ? { name: nextName } : {}),
      ...(multiple !== undefined && (multiple || connections.length <= 1) ? { multiple } : {}),
    }

    if (!Object.keys(patch).length) return false

    await registry.updateType(typeId, patch)

    if (patch.name) for (const { serverName } of connections) this.deps.serverChanged(serverName)

    return true
  }

  /** Подключение удалили: свой тип «один раз» уходит с ним, «несколько раз» остаётся в каталоге. */
  async afterRemoved(typeId: string | null): Promise<void> {
    const type = this.deps.registry.findType(typeId)

    if (type && !type.multiple && !this.deps.registry.connectionsOf(type.id).length) {
      await this.forget(type.id)
    }
  }

  private async forget(typeId: string): Promise<void> {
    await this.deps.registry.removeType(typeId)
    await this.deps.vault.forgetPrefix(typeSecretsKey(typeId)).catch(() => undefined)
  }
}
