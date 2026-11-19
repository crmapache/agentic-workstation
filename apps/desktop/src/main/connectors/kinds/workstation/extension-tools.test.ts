import { it, vi, expect, describe } from 'vitest'

import type { ExtensionInfo, ExtensionsState } from '@shared/extensions'
import { NO_CONTRIBUTIONS } from '@shared/extensions'

import type { WorkstationPorts } from '../../../workstation/workstation-link'
import { EXTENSION_TOOLS } from './extension-tools'

const info = (patch: Partial<ExtensionInfo>): ExtensionInfo => ({
  id: 'todo',
  dir: '/ext/todo',
  manifest: null,
  status: 'running',
  problem: null,
  granted: null,
  missing: { permissions: [], hosts: [], commands: [] },
  contributions: NO_CONTRIBUTIONS,
  settings: {},
  errors: 0,
  source: null,
  ...patch,
})

const tool = (name: string) => {
  const found = EXTENSION_TOOLS.find((item) => item.name === name)

  if (!found) throw new Error(name)

  return found
}

const portsWith = (state: ExtensionsState) => {
  const extensions = {
    state: () => state,
    logsOf: vi.fn(() => [{ at: 0, level: 'error' as const, text: 'boom' }]),
    reloadOne: vi.fn(() => Promise.resolve({ ok: true as const, state })),
    runCommand: vi.fn(() => Promise.resolve('done')),
  }

  return { ports: { extensions: () => extensions } as unknown as WorkstationPorts, extensions }
}

const CALL = { launch: null, signal: undefined }

describe('инструменты расширений для ИИ', () => {
  it('список говорит, чего ждёт расширение от человека', async () => {
    const { ports } = portsWith({
      root: '/ext',
      theme: {},
      extensions: [
        info({
          status: 'needsApproval',
          missing: { permissions: ['network'], hosts: ['api.github.com'], commands: [] },
        }),
      ],
    })
    const result = (await tool('list_extensions').run({}, ports, CALL)) as {
      extensions: { status: string; waitsForApproval: unknown; note: string }[]
    }

    expect(result.extensions[0]).toMatchObject({
      status: 'needsApproval',
      waitsForApproval: { permissions: ['network'], hosts: ['api.github.com'] },
    })
  })

  it('журнал и команда - по id; незнакомое расширение - отказ со списком', async () => {
    const { ports, extensions } = portsWith({ root: '/ext', theme: {}, extensions: [info({})] })

    await expect(
      tool('extension_logs').run({ extension: 'todo' }, ports, CALL),
    ).resolves.toMatchObject({
      entries: [{ level: 'error', text: 'boom', at: '1970-01-01T00:00:00.000Z' }],
    })
    await expect(
      tool('run_extension_command').run({ command: 'todo.add' }, ports, CALL),
    ).resolves.toEqual({
      result: 'done',
    })
    expect(extensions.runCommand).toHaveBeenCalledWith('todo.add', [])
    await expect(tool('extension_logs').run({ extension: 'nope' }, ports, CALL)).rejects.toThrow(
      'No extension "nope". Extensions: todo.',
    )
  })

  it('без расширений - просьба подождать', async () => {
    await expect(
      tool('list_extensions').run(
        {},
        { extensions: () => null } as unknown as WorkstationPorts,
        CALL,
      ),
    ).rejects.toThrow(/starting/)
  })
})
