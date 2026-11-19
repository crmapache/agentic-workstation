import type { ExtensionViewTree } from '@shared/extension-ui'
import type {
  ExtensionInfo,
  ExtensionsState,
  ExtensionStatus,
  ExtensionProblem,
  ExtensionSettingValue,
} from '@shared/extensions'
import { NO_CONTRIBUTIONS } from '@shared/extensions'

import type { FoundExtension } from './extension-catalog'
import type { ExtensionRuntime } from './extension-runtime'
import type { ExtensionsStore } from './extensions-store'
import type { StoredExtension } from './extensions-store'
import { missingGrant } from './manifest/grants'

/** Где расширение сейчас со стороны IDE: статус и причина, если не работает. */
export type ExtensionCondition = { status: ExtensionStatus; problem: ExtensionProblem | null }

/** Ключ секрета настройки в хранилище ключей. */
export const secretKey = (id: string, key: string): string => `extension:${id}:${key}`

/**
 * Расширение для окна: манифест, статус, чего не хватает до просьбы, вклад запущенного и
 * значения настроек (у секрета - только «задан ли»).
 */
export const extensionInfo = (
  found: FoundExtension,
  stored: StoredExtension,
  condition: ExtensionCondition,
  runtime: ExtensionRuntime | null,
  hasSecret: (key: string) => boolean,
  errors: number,
): ExtensionInfo => {
  const { manifest } = found
  const settings: Record<string, ExtensionSettingValue> = {}

  for (const field of manifest?.settings ?? []) {
    if (field.type === 'secret') settings[field.key] = { secret: hasSecret(field.key) }
    else
      settings[field.key] =
        stored.settings[field.key] ?? field.default ?? (field.type === 'switch' ? false : '')
  }

  return {
    id: found.id,
    dir: found.dir,
    manifest,
    status: condition.status,
    problem: condition.problem ?? found.problem,
    granted: stored.granted,
    missing: manifest
      ? missingGrant(manifest.requests, stored.granted)
      : { permissions: [], hosts: [], commands: [] },
    contributions: runtime && !runtime.stopped ? runtime.contributions() : NO_CONTRIBUTIONS,
    settings,
    errors,
    source: stored.source
      ? { version: stored.source.version, publisher: stored.source.publisher }
      : null,
  }
}

/** Тема от расширений: токены по порядку, позднее расширение главнее раннего. */
export const mergedTheme = (runtimes: readonly ExtensionRuntime[]): Record<string, string> =>
  Object.assign({}, ...runtimes.map((runtime) => runtime.theme ?? {})) as Record<string, string>

/** Состояние расширений целиком для окна: по порядку папок, с темой от запущенных. */
export const extensionsState = (input: {
  root: string
  found: readonly FoundExtension[]
  runtimes: ReadonlyMap<string, ExtensionRuntime>
  conditions: ReadonlyMap<string, ExtensionCondition>
  store: ExtensionsStore
  hasSecret: (id: string, key: string) => boolean
  errors: (id: string) => number
}): ExtensionsState => ({
  root: input.root,
  extensions: input.found.map((item) =>
    extensionInfo(
      item,
      input.store.get(item.id),
      input.conditions.get(item.id) ?? { status: 'stopped', problem: null },
      input.runtimes.get(item.id) ?? null,
      (key) => input.hasSecret(item.id, key),
      input.errors(item.id),
    ),
  ),
  theme: mergedTheme(input.found.flatMap((item) => input.runtimes.get(item.id) ?? [])),
})

/** Деревья всех видов запущенных расширений. */
export const viewTrees = (runtimes: Iterable<ExtensionRuntime>): ExtensionViewTree[] =>
  [...runtimes].flatMap((runtime) =>
    [...runtime.views].map(([local, view]) => ({
      key: runtime.key(local),
      tree: view.tree,
      revision: view.revision,
    })),
  )
