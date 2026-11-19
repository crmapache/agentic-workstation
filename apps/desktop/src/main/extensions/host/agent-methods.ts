import type { ExtensionHook } from '@shared/extensions'

import { flag, text, record, handlerOf, HostArgError } from './host-args'
import type { HostCall, HostMethod } from './host-types'

const TOOLS_MAX = 30
const TOOL_NAME = /^[a-z][a-z0-9_]{0,39}$/
/** Имя инструмента у Claude - `mcp__extensions__<имя>`, всё вместе не длиннее 64. */
const TOOL_FULL_NAME_MAX = 64 - 'mcp__extensions__'.length

const requirePermission = (call: HostCall, permission: 'agent.observe' | 'agent.intercept') => {
  if (!call.runtime.grant.permissions.includes(permission)) {
    throw new HostArgError(`This extension needs the "${permission}" permission.`)
  }
}

const HOOK_PERMISSION: Record<string, 'agent.observe' | 'agent.intercept'> = {
  beforeSend: 'agent.intercept',
  guard: 'agent.intercept',
  turnEnd: 'agent.observe',
}

/** Схема входа инструмента: объект JSON Schema, по умолчанию - без аргументов. */
const inputSchemaOf = (call: HostCall): Record<string, unknown> => {
  const schema = record(call.args, 'inputSchema')

  if (Object.keys(schema).length === 0) return { type: 'object', properties: {} }
  if (schema['type'] !== 'object')
    throw new HostArgError('"inputSchema" must be a JSON Schema with type "object".')
  if (JSON.stringify(schema).length > 20_000) throw new HostArgError('"inputSchema" is too large.')

  return schema
}

/**
 * Хуки разговоров ИИ (наблюдать - agent.observe, переписать и отказать - agent.intercept),
 * инструменты для ИИ (ai.tools) и вся IDE инструментами workstation (ide.control).
 */
export const AGENT_METHODS: Record<string, HostMethod> = {
  'agent.hook': {
    permission: null,
    run: (call) => {
      const hook = text(call.args, 'hook', 20)
      const permission = HOOK_PERMISSION[hook]

      if (!permission) throw new HostArgError(`Unknown hook "${hook}".`)

      requirePermission(call, permission)
      call.runtime.hooks.set(handlerOf(call.args), hook as ExtensionHook)
      call.context.changed(call.runtime, { kind: 'contributions' })
    },
  },
  'tools.register': {
    permission: 'ai.tools',
    run: (call) => {
      const name = text(call.args, 'name', 40)

      if (!TOOL_NAME.test(name))
        throw new HostArgError('Tool "name" must be snake_case latin: like "count_words".')
      if (call.runtime.toolName(name).length > TOOL_FULL_NAME_MAX) {
        throw new HostArgError(
          `Tool name "${call.runtime.toolName(name)}" is too long for AI providers.`,
        )
      }

      const previous = call.runtime.tools.get(name)

      if (!previous && call.runtime.tools.size >= TOOLS_MAX) {
        throw new HostArgError(`An extension may give AI up to ${TOOLS_MAX} tools.`)
      }

      if (previous) call.context.forget(call.runtime, previous.handler)

      call.runtime.tools.set(name, {
        description: text(call.args, 'description', 2000),
        inputSchema: inputSchemaOf(call),
        readOnly: flag(call.args, 'readOnly'),
        handler: handlerOf(call.args),
      })
      call.context.changed(call.runtime, { kind: 'tools' })
    },
  },
  'tools.unregister': {
    permission: 'ai.tools',
    run: (call) => {
      const handler = handlerOf(call.args)

      for (const [name, tool] of call.runtime.tools) {
        if (tool.handler === handler) call.runtime.tools.delete(name)
      }

      call.context.forget(call.runtime, handler)
      call.context.changed(call.runtime, { kind: 'tools' })
    },
  },
  'workstation.tools': {
    permission: 'ide.control',
    run: (call) => call.context.workstation.tools(),
  },
  'workstation.call': {
    permission: 'ide.control',
    run: (call) =>
      call.context.workstation.call(text(call.args, 'tool', 80), record(call.args, 'args')),
  },
}
