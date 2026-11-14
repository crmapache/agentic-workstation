import { it, expect, describe } from 'vitest'

import { EVERYWHERE } from '@shared/connector-availability'
import { CONNECTOR_DESCRIPTION_MAX } from '@shared/connectors'

import type { StoredConnector } from './connector-store'
import { statusOf, enabledTools, connectorView, instructionsFor } from './connector-view'
import { computerGuide, COMPUTER_GUIDE } from './kinds/computer/computer-guide'

const connector: StoredConnector = {
  id: 'a',
  kind: 'gmail',
  label: 'Work',
  typeId: null,
  description: '',
  serverName: 'gmail-work',
  url: null,
  auth: null,
  transport: null,
  command: null,
  spec: null,
  availability: EVERYWHERE,
  inProjects: {},
  account: 'me@work.com',
  enabled: true,
  toolOverrides: {},
  tools: [
    { name: 'search_threads', description: '', access: 'read' },
    { name: 'send_draft', description: '', access: 'outbound' },
  ],
}

const live = { signedIn: true, signingIn: false, failure: null }

/** Сколько знаков пояснения сервера Claude Code отдаёт модели, остальное обрезает. */
const CLAUDE_INSTRUCTIONS_MAX = 2048

describe('statusOf', () => {
  it('выключен - главнее всего, дальше вход, потом сбой', () => {
    expect(statusOf({ ...connector, enabled: false }, { ...live, signingIn: true })).toBe(
      'disabled',
    )
    expect(statusOf(connector, { ...live, signingIn: true })).toBe('signing-in')
    expect(statusOf(connector, { ...live, signedIn: false })).toBe('signed-out')
    expect(statusOf(connector, { ...live, failure: 'unreachable' })).toBe('failed')
    expect(statusOf(connector, live)).toBe('connected')
  })
})

describe('enabledTools', () => {
  it('отправка выключена, пока человек её не включил', () => {
    expect(enabledTools(connector.tools, {}).map((tool) => tool.name)).toEqual(['search_threads'])
    expect(enabledTools(connector.tools, { send_draft: true, search_threads: false })).toEqual([
      connector.tools[1],
    ])
  })
})

describe('connectorView', () => {
  it('отправка выключена, адрес своего MCP - как в реестре', () => {
    const view = connectorView({ ...connector, kind: 'mcp', url: 'https://x.dev/mcp' }, live, null)

    expect(view.url).toBe('https://x.dev/mcp')
    expect(view.description).toBe('')
    expect(view).toMatchObject({ typeId: null, name: null })
    expect(view.tools.map((tool) => tool.enabled)).toEqual([true, false])
  })
})

describe('instructionsFor', () => {
  it('говорит, чей ящик и что отправка выключена', () => {
    const text = instructionsFor(connector, live, null)

    expect(text).toContain('me@work.com')
    expect(text).toContain('prepare drafts')
  })

  it('инструкции проекта и профиль Chrome - только в разговорах этого проекта', () => {
    const browser = {
      ...connector,
      kind: 'browser' as const,
      serverName: 'browser-chrome',
      account: null,
      inProjects: {
        '/p/improving': {
          instructions: 'Engage lives at engage.example',
          browserProfile: 'Improving',
        },
      },
    }
    const inProject = instructionsFor(browser, live, null, '/p/improving')

    expect(inProject).toContain('Chrome profile "Improving"')
    expect(inProject).toContain('in this project: Engage lives at engage.example')
    // Правила вкладок - у Browser всегда, а не только там, где сказано что-то своё.
    expect(instructionsFor(browser, live, null, '/p/other')).toContain('a tab of your own')
    expect(instructionsFor(browser, live, null, '/p/other')).not.toContain('Engage')
    expect(instructionsFor(browser, live, null, null)).not.toContain('Improving')
    // Профиль Chrome - только у браузера; выключенному коннектору инструкции не нужны.
    expect(
      instructionsFor({ ...browser, kind: 'gmail' as const }, live, null, '/p/improving'),
    ).not.toContain('Chrome profile')
    expect(
      instructionsFor({ ...browser, enabled: false }, live, null, '/p/improving'),
    ).not.toContain('Engage')
  })

  it('без входа - просит войти на виде Connectors', () => {
    expect(instructionsFor(connector, { ...live, signedIn: false }, null)).toContain(
      'not signed in',
    )
  })

  it('свой тип - по имени, «один раз» без подписи', () => {
    const playwright = {
      ...connector,
      kind: 'command' as const,
      label: '',
      serverName: 'playwright',
      account: null,
    }

    expect(instructionsFor(playwright, live, 'Playwright')).toMatch(
      /^Playwright \(MCP server\), connected through Agentic Workstation\./,
    )
    expect(instructionsFor({ ...playwright, enabled: false }, live, 'Playwright')).toContain(
      'Connectors → Playwright.',
    )
    expect(instructionsFor({ ...playwright, label: '1' }, live, 'Playwright')).toMatch(
      /^Playwright \(MCP server\) \("1"\)/,
    )
  })

  it('Browser: действовать на странице рукой, evaluate - только читать; выключенному - не надо', () => {
    const browser = { ...connector, kind: 'browser' as const, label: '', account: null, tools: [] }
    const text = instructionsFor(browser, live, null)

    expect(text).toMatch(/^the user's Chrome, connected through Agentic Workstation\.\n/)
    expect(text).toContain('Use evaluate only to read or compute')
    expect(instructionsFor({ ...browser, enabled: false }, live, null)).not.toContain('evaluate')
    expect(instructionsFor(connector, live, null)).not.toContain('evaluate')
  })

  it('Browser говорит о Computer Use, только когда он есть в проекте, и после слов человека', () => {
    const browser = {
      ...connector,
      kind: 'browser' as const,
      label: '',
      account: null,
      tools: [],
      description: 'Work profile only',
    }
    const alone = instructionsFor(browser, live, null, '/p', [])
    const withComputer = instructionsFor(browser, live, null, '/p', ['computer', 'gmail'])

    expect(alone).not.toContain('Computer Use')
    expect(withComputer).toContain('Computer Use connector (server computer)')
    expect(withComputer.indexOf('Work profile only')).toBeLessThan(
      withComputer.indexOf('Computer Use connector'),
    )
  })

  // Claude Code режет пояснение сервера до 2048 знаков: описание человека любой длины должно
  // доходить до модели целиком.
  it('Browser и Computer Use с описанием предельной длины укладываются в 2048 знаков', () => {
    const description = 'x'.repeat(CONNECTOR_DESCRIPTION_MAX)

    for (const kind of ['browser', 'computer'] as const) {
      const text = instructionsFor(
        { ...connector, kind, label: '', account: null, tools: [], description },
        live,
        null,
      )

      expect(text.length).toBeLessThanOrEqual(CLAUDE_INSTRUCTIONS_MAX)
      expect(text).toContain(description)
    }

    // На Windows у Computer Use строкой больше - и она тоже должна влезать.
    const onWindows = instructionsFor(
      { ...connector, kind: 'computer', label: '', account: null, tools: [], description },
      live,
      null,
    ).replace(COMPUTER_GUIDE, computerGuide(true))

    expect(onWindows.length).toBeLessThanOrEqual(CLAUDE_INSTRUCTIONS_MAX)
  })

  it('описание человека - отдельной строкой, пустое не добавляет ничего', () => {
    const described = { ...connector, description: '  Client mail: invoices only  ' }

    expect(instructionsFor(described, live, null)).toMatch(
      /\nThe user describes this connector: Client mail: invoices only$/,
    )
    expect(instructionsFor(connector, live, null)).not.toContain('describes')
  })
})
