import type { ExtensionRuntime } from '../extension-runtime'
import { AGENT_METHODS } from './agent-methods'
import { FILES_METHODS } from './files-methods'
import type { HostMethod, HostContext } from './host-types'
import { STATE_METHODS } from './state-methods'
import { SYSTEM_METHODS } from './system-methods'
import { UI_METHODS } from './ui-methods'

/** Все ручки расширений по имени метода моста. */
export const HOST_METHODS: Record<string, HostMethod> = {
  ...UI_METHODS,
  ...STATE_METHODS,
  ...FILES_METHODS,
  ...AGENT_METHODS,
  ...SYSTEM_METHODS,
}

/**
 * Вызов ручки расширением: незнакомый метод и право, которого нет в действующих, - отказ
 * его словами. Права здесь - и просьба манифеста, и выдано человеком (effectiveGrant).
 */
export const callHost = (
  runtime: ExtensionRuntime,
  method: string,
  args: unknown,
  context: HostContext,
): Promise<unknown> =>
  Promise.resolve().then(() => {
    const handler = Object.hasOwn(HOST_METHODS, method) ? HOST_METHODS[method] : undefined

    if (!handler) throw new Error(`Unknown IDE method "${method}".`)
    if (runtime.stopped) throw new Error('The extension stopped.')

    if (handler.permission && !runtime.grant.permissions.includes(handler.permission)) {
      throw new Error(
        `This extension needs the "${handler.permission}" permission: add it to "permissions" in extension.json and approve it in Extensions.`,
      )
    }

    const record =
      typeof args === 'object' && args !== null && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : {}

    return handler.run({ runtime, args: record, context })
  })
