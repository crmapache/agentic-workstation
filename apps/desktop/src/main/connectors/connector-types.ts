import type { CustomType, TypeSignIn } from '@shared/connectors'

import { maskArgs } from '../claude/tools/secret-mask'
import { labelSlug } from './connector-names'
import type { StoredType, StoredConnector } from './connector-store'

/**
 * Имя с заглавной (ADR 0034): Playwright, а не playwright - как Gmail рядом. Пробелы по
 * краям и двойные - прочь, остальные буквы как есть: GitHub остаётся GitHub.
 */
export const capitalized = (text: string): string => {
  const trimmed = text.trim().replace(/\s+/g, ' ')

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/** Имя из имени сервера или подписи: notion-web - Notion Web, chatkepr - Chatkepr. */
export const titleName = (text: string): string =>
  text
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => capitalized(word))
    .join(' ')

/**
 * Имя сервера подключения своего типа: начало и подпись (playwright-1), у типа «один раз» -
 * одно начало. Подпись без латиницы и цифр - null.
 */
export const typeServerName = (
  type: Pick<StoredType, 'serverBase' | 'multiple'>,
  label: string,
) => {
  if (!type.multiple) return type.serverBase

  const slug = labelSlug(label)

  return slug ? `${type.serverBase}-${slug}` : null
}

/** Образец своего типа из того, чем работает подключение: каждое новое получит копию. */
export const typeFrom = (
  connector: StoredConnector,
  fields: Pick<StoredType, 'id' | 'name' | 'multiple' | 'serverBase'>,
): StoredType | null => {
  const { kind, url, auth, transport, command, spec } = connector

  if (kind !== 'mcp' && kind !== 'command' && kind !== 'http') return null

  return { ...fields, kind, url, auth, transport, command, spec }
}

/** Чем работает новое подключение - копия образца, без входа и выбора инструментов. */
export const definitionOf = (
  type: StoredType,
): Pick<StoredConnector, 'kind' | 'typeId' | 'url' | 'auth' | 'transport' | 'command' | 'spec'> => {
  const { kind, url, auth, transport, command, spec } = type

  return { kind, typeId: type.id, url, auth, transport, command, spec }
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const signInOf = (type: StoredType): TypeSignIn => {
  if (type.kind === 'mcp') {
    if (type.auth === 'oauth') return 'browser'

    return type.auth === 'token' ? 'token' : 'none'
  }

  const auth = type.spec?.auth.type ?? 'none'

  if (type.kind === 'command' || auth === 'none') return 'none'

  return auth === 'basic' ? 'basic' : 'key'
}

/** Свой тип для окна: ключи команды замаскированы - экран видят на демонстрации. */
export const typeView = (type: StoredType): CustomType => {
  const command = type.command ? [type.command.command, ...maskArgs(type.command.args)] : []
  const detail = type.spec
    ? hostOf(type.spec.baseUrl)
    : type.url
      ? hostOf(type.url)
      : command.join(' ')

  return {
    id: type.id,
    kind: type.kind,
    name: type.name,
    multiple: type.multiple,
    detail,
    signIn: signInOf(type),
  }
}

/** Конец имени сервера, по которому подключения одного типа различаются: playwright-1. */
const NUMBERED = /^(.+)-([a-z0-9]+)$/

/**
 * Группы для переноса старых коннекторов и импорта: одинаково работают (definition) и
 * называются «начало-подпись» с одним началом - одно подключение своего типа «несколько
 * раз» (playwright-1 и playwright-2 - Playwright, подписи 1 и 2). Остальные - сами по себе,
 * null.
 */
export const groupByBase = <T>(
  items: readonly T[],
  serverName: (item: T) => string,
  definition: (item: T) => string,
): Map<T, { base: string; label: string } | null> => {
  const keyOf = (item: T) => {
    const match = NUMBERED.exec(serverName(item))

    return match ? `${definition(item)}\n${match[1] ?? ''}` : null
  }
  const counts = new Map<string, number>()

  for (const item of items) {
    const key = keyOf(item)

    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return new Map(
    items.map((item) => {
      const key = keyOf(item)
      const [, base = '', label = ''] = NUMBERED.exec(serverName(item)) ?? []

      return [item, key && (counts.get(key) ?? 0) > 1 ? { base, label } : null]
    }),
  )
}

/** План переноса: новые типы, правки коннекторов и чьи секреты станут образцом типа. */
export type TypesPlan = {
  types: StoredType[]
  patches: Map<string, Pick<StoredConnector, 'typeId' | 'label'>>
  /** id типа - id коннектора, чьи секреты того, чем он работает, копируются в образец. */
  secretsFrom: Map<string, string>
}

/**
 * Свои коннекторы без типа (реестр до ADR 0034) получают типы. Одинаково работают и
 * называются «начало-подпись» с одним началом (playwright-1 и playwright-2) - один тип
 * «несколько раз» (Playwright, подписи 1 и 2); остальные - тип «один раз» с именем из
 * подписи (chatkepr - Chatkepr). Имена серверов не меняются. definition - чем работает
 * коннектор, строкой для сравнения (с секретами образца).
 */
export const planTypes = (
  loose: readonly StoredConnector[],
  definition: (connector: StoredConnector) => string,
  newId: () => string,
): TypesPlan => {
  const plan: TypesPlan = { types: [], patches: new Map(), secretsFrom: new Map() }
  const groups = groupByBase(loose, (connector) => connector.serverName, definition)
  const grouped = new Map<string, StoredType>()

  for (const connector of loose) {
    const group = groups.get(connector) ?? null
    const key = group ? `${definition(connector)}\n${group.base}` : null
    let type = key ? grouped.get(key) : undefined

    if (!type) {
      const created = typeFrom(connector, {
        id: newId(),
        name: titleName(group ? group.base : connector.label || connector.serverName),
        multiple: Boolean(group),
        serverBase: group ? group.base : connector.serverName,
      })

      if (!created) continue

      type = created
      plan.types.push(type)
      plan.secretsFrom.set(type.id, connector.id)

      if (key) grouped.set(key, type)
    }

    plan.patches.set(connector.id, {
      typeId: type.id,
      label: group ? capitalized(group.label) : '',
    })
  }

  return plan
}
