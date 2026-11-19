import type { ExtensionGrant, ExtensionPermission } from '@shared/extensions'
import { EMPTY_GRANT } from '@shared/extensions'

/**
 * Чего не хватает выданному до просьбы: пусто - расширение может работать. Выдано шире -
 * не беда: расширение просто просит меньше.
 */
export const missingGrant = (
  requested: ExtensionGrant,
  granted: ExtensionGrant | null,
): ExtensionGrant => {
  const have = granted ?? EMPTY_GRANT

  return {
    permissions: requested.permissions.filter(
      (permission) => !have.permissions.includes(permission),
    ),
    hosts: requested.hosts.filter((host) => !have.hosts.includes(host)),
    commands: requested.commands.filter((command) => !have.commands.includes(command)),
  }
}

export const isEmptyGrant = (grant: ExtensionGrant): boolean =>
  grant.permissions.length === 0 && grant.hosts.length === 0 && grant.commands.length === 0

/**
 * Действующие права расширения - пересечение просьбы манифеста и выданного человеком: право,
 * которое манифест больше не просит, не действует, даже если когда-то выдано.
 */
export const effectiveGrant = (
  requested: ExtensionGrant,
  granted: ExtensionGrant | null,
): ExtensionGrant => {
  const have = granted ?? EMPTY_GRANT

  return {
    permissions: requested.permissions.filter((permission) =>
      have.permissions.includes(permission),
    ),
    hosts: requested.hosts.filter((host) => have.hosts.includes(host)),
    commands: requested.commands.filter((command) => have.commands.includes(command)),
  }
}

export const hasPermission = (grant: ExtensionGrant, permission: ExtensionPermission): boolean =>
  grant.permissions.includes(permission)

/** Хост в рамках: точное имя или «*.домен» для поддомена (сам домен - своей строкой). */
export const hostAllowed = (hosts: readonly string[], hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/\.$/, '')

  return hosts.some((pattern) =>
    pattern.startsWith('*.')
      ? host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1
      : host === pattern,
  )
}
