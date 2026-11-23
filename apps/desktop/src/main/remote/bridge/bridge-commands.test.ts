import { it, expect, describe, afterEach } from 'vitest'

import type { CommandEntry } from '@shared/slash-catalog'

import type { SlashCommandsWire } from '@agentic-workstation/remote-protocol/conversation-wire-types'

import { bridgeSetup, stopBridges } from '../__fixtures__/fake-bridge'
import { PROJECT_PATH, CONVERSATION_ID } from '../__fixtures__/fake-ide'
import { addPanel, PANEL_CONVERSATION } from '../__fixtures__/fake-panels'
import { asIs, sizeOf } from './fit'
import { commandsThatFit, COMMAND_HINT_CHARS } from './reads-fit'

afterEach(stopBridges)

const catalogOf = (outcome: unknown): SlashCommandsWire =>
  (outcome as { data: SlashCommandsWire }).data

describe('каталог «/» с телефона', () => {
  it('встроенные, названные CLI, потом диск по имени - без папок и команд, которых CLI не выполнит', async () => {
    const { ide, command } = bridgeSetup()

    ide.state.builtinCommands = [
      { name: 'compact', description: 'Free up context', argumentHint: '', builtin: true },
      { name: '__remote-workflow', description: 'server', argumentHint: '', builtin: true },
    ]
    ide.state.commandsByProject = {
      [PROJECT_PATH]: [
        { name: 'deploy', description: '', argumentHint: '' },
        { name: 'status', description: '', argumentHint: '' },
      ],
    }
    ide.claude.diskCommands = (path) => {
      ide.record('diskCommands', path)

      return Promise.resolve([
        { name: 'deploy', description: `Ship ${PROJECT_PATH}/app`, argumentHint: '[env]' },
        { name: 'alpha', description: 'a'.repeat(1000), argumentHint: '' },
      ])
    }

    const catalog = catalogOf(
      await command('conversation.commands', { conversationId: CONVERSATION_ID }),
    )

    expect(catalog.commands.map((entry) => [entry.name, entry.group])).toEqual([
      ['context', 'built-in'],
      ['cost', 'built-in'],
      ['usage', 'built-in'],
      ['code-review', 'built-in'],
      ['deploy', 'project'],
      ['compact', 'built-in'],
      ['alpha', 'project'],
    ])
    expect(catalog.commands[4]).toMatchObject({ hint: 'Ship {project}/app', argumentHint: '[env]' })
    expect(catalog.commands[6]?.hint).toHaveLength(COMMAND_HINT_CHARS)
    expect(catalog.more).toBe(false)
    expect(ide.calls.find((call) => call.name === 'diskCommands')?.args).toEqual([PROJECT_PATH])
    expect(JSON.stringify(catalog)).not.toContain('/Users/')
  })

  it('диск не прочёлся - каталог из того, что назвал CLI', async () => {
    const { ide, command } = bridgeSetup()

    ide.state.builtinCommands = []
    ide.state.commandsByProject = {
      [PROJECT_PATH]: [{ name: 'deploy', description: 'Ship', argumentHint: '' }],
    }
    ide.claude.diskCommands = () => Promise.reject(new Error('EACCES'))

    const catalog = catalogOf(
      await command('conversation.commands', { conversationId: CONVERSATION_ID }),
    )

    expect(catalog.commands.map((entry) => entry.name)).toContain('deploy')
  })

  it('Codex - его встроенные, диска не читает; чужой разговор - отказ', async () => {
    const setup = bridgeSetup()
    const codex = addPanel(setup.ide, 'codex')

    codex.state.builtinCommands = []
    codex.state.commandsByProject = {
      [PROJECT_PATH]: [{ name: 'fix-tests', description: 'Codex skill', argumentHint: '' }],
    }

    const catalog = catalogOf(
      await setup.command('conversation.commands', { conversationId: PANEL_CONVERSATION.codex }),
    )

    expect(catalog.commands.map((entry) => entry.name)).toEqual(['compact', 'review', 'fix-tests'])
    expect(
      await setup.command('conversation.commands', {
        conversationId: '00000000-0000-4000-8000-000000000000',
      }),
    ).toMatchObject({ ok: false, code: 'notFound' })
  })

  it('не влезло в кадр - сколько влезло и «есть ещё»; команд панели телефону нет', () => {
    const entries: CommandEntry[] = [
      { id: 'resume', hint: 'past', group: 'panel' },
      ...Array.from({ length: 50 }, (_, index) => ({
        id: `skill-${index}`,
        hint: 'x'.repeat(200),
        group: 'project' as const,
      })),
    ]
    const whole = commandsThatFit(entries, asIs)
    const cut = commandsThatFit(entries, asIs, 2_000)

    expect(whole.commands.map((entry) => entry.name)).not.toContain('resume')
    expect(whole).toMatchObject({ more: false })
    expect(whole.commands).toHaveLength(50)
    expect(cut.more).toBe(true)
    expect(cut.commands.length).toBeGreaterThan(0)
    expect(sizeOf(cut)).toBeLessThanOrEqual(2_000)
  })
})
