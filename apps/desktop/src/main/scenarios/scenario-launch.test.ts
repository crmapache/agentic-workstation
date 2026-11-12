import { it, expect, describe } from 'vitest'

import { scenarioArgs } from './scenario-launch'

const features = {
  manualMode: true,
  allowSkipPermissions: false,
  safeMode: false,
}

const spec = {
  sessionId: '00000000-0000-4000-8000-000000000001',
  resume: false,
  model: 'opus',
  effort: 'high',
  permissionMode: 'default',
  briefing: 'One line.',
  accountId: '',
  mcpConfig: null,
}

describe('scenario launch', () => {
  it('asks permissions over stdio, names the session and maps «ask» to manual', () => {
    const args = scenarioArgs(spec, features)

    expect(args).toContain('--permission-prompt-tool')
    expect(args.slice(args.indexOf('--session-id'), args.indexOf('--session-id') + 2)).toEqual([
      '--session-id',
      spec.sessionId,
    ])
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('manual')
    expect(args).not.toContain('--setting-sources')
  })

  it('resumes a conversation on disk and passes a card’s own mode', () => {
    const args = scenarioArgs({ ...spec, resume: true, permissionMode: 'acceptEdits' }, features)

    expect(args).toContain('--resume')
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('acceptEdits')
  })

  it('takes only the IDE connectors, and their file when there is one', () => {
    expect(scenarioArgs(spec, features)).toContain('--strict-mcp-config')
    expect(scenarioArgs(spec, features)).not.toContain('--mcp-config')

    const args = scenarioArgs({ ...spec, mcpConfig: '/tmp/gateway.json' }, features)

    expect(args[args.indexOf('--mcp-config') + 1]).toBe('/tmp/gateway.json')
  })

  it('drops a model or effort that is not a name, and keeps the briefing on one line', () => {
    const args = scenarioArgs(
      { ...spec, model: 'x"; rm', effort: 'huge', briefing: 'a\n"b"' },
      features,
    )

    expect(args).not.toContain('--model')
    expect(args).not.toContain('--effort')
    expect(args[args.indexOf('--append-system-prompt') + 1]).toBe('a  b ')
  })
})
