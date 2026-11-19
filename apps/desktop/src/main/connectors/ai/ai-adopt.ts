import { randomUUID } from 'node:crypto'

import { proposalNeed } from '@shared/ai-proposal'
import type { AiJob } from '@shared/connector-spec'
import type { AddConnectorError, AddConnectorRequest } from '@shared/connectors'

import { newConnector } from '../connector-add'
import type { NewConnector } from '../connector-add'
import type { ConnectorRegistry } from '../connector-registry'
import type { ImportDesk } from '../import/import-desk'

/**
 * Как добавить готовое от ИИ без человека (ADR 0086): перенос сервера из Claude Code по ключу
 * кандидата или запрос той же формы, что жмёт человек, с полями по умолчанию (имя - сервис, без
 * подписи, один раз). Ключа нет и не нужно - его ждёт форма, а не IDE.
 */
export type AiAdoption =
  | { kind: 'import'; key: string; serverName: string }
  | { kind: 'add'; request: AddConnectorRequest }

/** Готовое, которому ничего не нужно от человека; иначе (или предложения нет) - null. */
export const adoptionOf = ({ proposal, request }: AiJob): AiAdoption | null => {
  if (!proposal || proposalNeed(proposal, request.docsUrl)) return null

  if (proposal.kind === 'existing') {
    const { key, serverName } = proposal.candidate

    return { kind: 'import', key, serverName }
  }

  if (proposal.kind === 'mcp') {
    const { url, auth } = proposal

    return {
      kind: 'add',
      request: {
        kind: 'mcp',
        url,
        auth,
        token: '',
        name: request.service,
        multiple: false,
        label: '',
      },
    }
  }

  return {
    kind: 'add',
    request: {
      kind: 'http',
      spec: proposal.spec,
      secret: '',
      username: '',
      name: proposal.spec.service,
      multiple: false,
      label: '',
    },
  }
}

/** Чем добавлять готовое: реестр (занятые имена), перенос из Claude Code и добавление сервиса. */
export type AdoptHost = {
  registry: ConnectorRegistry
  imports: ImportDesk
  add: (prepared: NewConnector) => Promise<AddConnectorError | null>
}

/**
 * Готовое от ИИ, которому ничего не нужно от человека (ADR 0086), - коннектором, как по кнопке
 * формы. Сервер из Claude Code, уже перенесённый раньше, - тот же коннектор. id нового или null.
 */
export const adoptAiJob = async (job: AiJob, host: AdoptHost): Promise<string | null> => {
  const adoption = adoptionOf(job)

  if (!adoption) return null

  if (adoption.kind === 'add') {
    const taken = { servers: host.registry.serverNames(), bases: host.registry.serverBases() }
    const ids = { connector: randomUUID(), type: randomUUID() }
    const prepared = newConnector(adoption.request, ids, taken, {})

    if (typeof prepared === 'string') return null

    return (await host.add(prepared)) ? null : prepared.connector.id
  }

  await host.imports.candidates()

  const { skipped } = await host.imports.import([adoption.key])
  const reason = skipped[0]?.reason
  const added = host.registry.connectors.find((item) => item.serverName === adoption.serverName)

  return added && (!reason || reason === 'taken') ? added.id : null
}
