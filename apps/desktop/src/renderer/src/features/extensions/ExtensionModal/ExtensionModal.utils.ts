import type { ExtensionInfo, ExtensionGrant } from '@shared/extensions'
import { EMPTY_GRANT } from '@shared/extensions'

import { LOG_TIME } from './ExtensionModal.constants'

/** Время записи журнала словами часов. */
export const logTime = (at: number): string => LOG_TIME.format(at)

/**
 * Что расширение может сейчас: выдано человеком и всё ещё просит манифест. Выданное, которое
 * манифест больше не просит, не действует - его и не показываем.
 */
export const workingGrant = ({ manifest, granted }: ExtensionInfo): ExtensionGrant => {
  if (!manifest || !granted) return EMPTY_GRANT

  const { requests } = manifest

  return {
    permissions: granted.permissions.filter((permission) =>
      requests.permissions.includes(permission),
    ),
    hosts: granted.hosts.filter((host) => requests.hosts.includes(host)),
    commands: granted.commands.filter((command) => requests.commands.includes(command)),
  }
}
