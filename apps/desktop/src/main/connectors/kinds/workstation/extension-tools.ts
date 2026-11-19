import type { ExtensionInfo } from '@shared/extensions'

import { numberArg, stringArg, ArgumentError } from '../native-tools'
import type { NativeTool } from '../native-tools'
import type { ExtensionsPort, WorkstationPorts } from '../../../workstation/workstation-link'

const extensionsOf = (ports: WorkstationPorts): ExtensionsPort => {
  const extensions = ports.extensions()

  if (!extensions)
    throw new ArgumentError('Extensions are starting or the IDE is closing. Try again in a moment.')

  return extensions
}

const findExtension = (extensions: ExtensionsPort, named: string): ExtensionInfo => {
  const list = extensions.state().extensions
  const found = list.find((item) => item.id === named || item.manifest?.name === named)

  if (!found) {
    throw new ArgumentError(
      `No extension "${named}". Extensions: ${list.map((item) => item.id).join(', ') || 'none'}.`,
    )
  }

  return found
}

/** Расширение словами модели: что с ним, чего ему не хватает и что оно внесло. */
const extensionView = (item: ExtensionInfo) => ({
  id: item.id,
  name: item.manifest?.name ?? item.id,
  version: item.manifest?.version ?? null,
  folder: item.dir,
  status: item.status,
  problem: item.problem,
  ...(item.status === 'needsApproval' && {
    waitsForApproval: item.missing,
    note: 'Only the person can approve permissions: Agentic Workstation → Extensions.',
  }),
  errorsSinceStart: item.errors,
  commands: item.contributions.commands,
  views: item.contributions.views.map((view) => ({
    key: view.key,
    title: view.title,
    place: view.place,
  })),
  statusItems: item.contributions.statusItems.map((status) => status.text),
  aiTools: item.contributions.tools.map((tool) => tool.name),
  hooks: item.contributions.hooks,
})

/** Расширения IDE (ADR 0091) для ИИ, который их пишет: проверить, что живо, и что в журнале. */
export const EXTENSION_TOOLS: NativeTool<WorkstationPorts>[] = [
  {
    name: 'list_extensions',
    description:
      'IDE extensions: status (running, failed, needsApproval, disabled, invalid), the problem if any, permissions waiting for approval, and what each one added (commands, views, AI tools, hooks).',
    access: 'read',
    inputSchema: { type: 'object', properties: {} },
    run: (_args, ports) =>
      Promise.resolve().then(() => ({
        folder: extensionsOf(ports).state().root,
        extensions: extensionsOf(ports).state().extensions.map(extensionView),
      })),
  },
  {
    name: 'extension_logs',
    description:
      'The log of an extension: its console output and errors with stack traces, newest last. Read it after a change to see whether the extension works.',
    access: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        extension: { type: 'string', description: 'Extension id or name.' },
        last: {
          type: 'number',
          description: 'How many entries from the end. Default 50, up to 300.',
        },
      },
      required: ['extension'],
    },
    run: (args, ports) =>
      Promise.resolve().then(() => {
        const extensions = extensionsOf(ports)
        const item = findExtension(extensions, stringArg(args, 'extension', true))
        const last = numberArg(args, 'last', { min: 1, max: 300, fallback: 50 })

        return {
          extension: item.id,
          status: item.status,
          problem: item.problem,
          entries: extensions
            .logsOf(item.id)
            .slice(-last)
            .map((entry) => ({
              at: new Date(entry.at).toISOString(),
              level: entry.level,
              text: entry.text,
            })),
        }
      }),
  },
  {
    name: 'reload_extension',
    description:
      'Start an extension again from its folder (the IDE also does it by itself on every save of its files). Returns its status after the start.',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: { extension: { type: 'string', description: 'Extension id or name.' } },
      required: ['extension'],
    },
    run: async (args, ports) => {
      const extensions = extensionsOf(ports)
      const item = findExtension(extensions, stringArg(args, 'extension', true))
      const result = await extensions.reloadOne(item.id)
      const after = result.state.extensions.find((entry) => entry.id === item.id)

      return after ? extensionView(after) : { id: item.id, status: 'gone' }
    },
  },
  {
    name: 'run_extension_command',
    description:
      'Run a command of a running extension, as the person would from Search Everywhere, and get what it returns. command: "<extension-id>.<command-id>".',
    access: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        args: {
          type: 'array',
          items: {},
          description: 'Arguments for the command, if it takes any.',
        },
      },
      required: ['command'],
    },
    run: async (args, ports) => {
      const extensions = extensionsOf(ports)
      const command = stringArg(args, 'command', true)
      const commandArgs = Array.isArray(args['args']) ? args['args'] : []

      try {
        return { result: (await extensions.runCommand(command, commandArgs)) ?? null }
      } catch (error) {
        throw new ArgumentError(error instanceof Error ? error.message : String(error))
      }
    },
  },
]
