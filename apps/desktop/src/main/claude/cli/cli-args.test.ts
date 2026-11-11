import { it, expect, describe } from 'vitest'

import { buildLaunchArgs } from './cli-args'

const features = {
  manualMode: true,
  allowSkipPermissions: false,
  safeMode: true,
}
const base = {
  sessionId: 'new',
  model: null,
  effort: null,
  permissionMode: 'default' as const,
  fork: null,
  mcpConfig: null,
}

/** Значение флага в аргументах. */
const valueOf = (args: string[], flag: string) => args[args.indexOf(flag) + 1]

describe('аргументы запуска', () => {
  it('новый разговор - с нашим id, продолженный - --resume', () => {
    expect(valueOf(buildLaunchArgs({ ...base, resume: false }, features), '--session-id')).toBe(
      'new',
    )
    expect(valueOf(buildLaunchArgs({ ...base, resume: true }, features), '--resume')).toBe('new')
  })

  it('нерождённый форк - от источника до строки, под нашим id', () => {
    const args = buildLaunchArgs(
      { ...base, resume: false, fork: { sourceSessionId: 'src', at: 'line' } },
      features,
    )

    expect(valueOf(args, '--resume')).toBe('src')
    expect(args).toContain('--fork-session')
    expect(valueOf(args, '--session-id')).toBe('new')
    expect(valueOf(args, '--resume-session-at')).toBe('line')
  })

  it('родившийся форк продолжается своим транскриптом', () => {
    const args = buildLaunchArgs(
      { ...base, resume: true, fork: { sourceSessionId: 'src', at: 'line' } },
      features,
    )

    expect(valueOf(args, '--resume')).toBe('new')
    expect(args).not.toContain('--fork-session')
  })

  it('слои настроек не урезаются: CLI читает все, как в терминале', () => {
    expect(buildLaunchArgs({ ...base, resume: false }, features)).not.toContain('--setting-sources')
  })

  it('MCP - только коннекторы IDE: строгий конфиг всегда, файл - когда они есть', () => {
    const path = '/Users/me/Library/Application Support/Agentic Workstation/connectors-mcp.json'

    expect(buildLaunchArgs({ ...base, resume: false }, features)).not.toContain('--mcp-config')
    expect(buildLaunchArgs({ ...base, resume: false }, features)).toContain('--strict-mcp-config')
    expect(
      valueOf(
        buildLaunchArgs({ ...base, resume: false, mcpConfig: path }, features),
        '--mcp-config',
      ),
    ).toBe(path)
    expect(buildLaunchArgs({ ...base, resume: false, mcpConfig: path }, features)).toContain(
      '--strict-mcp-config',
    )
  })

  it('adds the released head briefing after the panel one, on one line', () => {
    const args = buildLaunchArgs(
      { ...base, resume: false, extraBriefing: 'Role is over.' },
      features,
    )
    const briefing = args[args.indexOf('--append-system-prompt') + 1]

    expect(briefing?.endsWith(' Role is over.')).toBe(true)
  })
})
