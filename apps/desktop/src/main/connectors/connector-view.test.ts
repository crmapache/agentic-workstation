import { it, expect, describe } from 'vitest'

import { EVERYWHERE } from '@shared/connector-availability'
import { CONNECTOR_DESCRIPTION_MAX } from '@shared/connectors'

import type { StoredConnector } from './connector-store'
import { statusOf, connectorView, instructionsFor } from './connector-view'
import { toolOpenFor } from './outbound-gate'
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

describe('toolOpenFor', () => {
  it('отправка выключена, пока человек её не включил', () => {
    expect(toolOpenFor('outbound', undefined, null)).toBe(false)
    expect(toolOpenFor('outbound', true, null)).toBe(true)
    expect(toolOpenFor('read', false, null)).toBe(false)
  })

  it('у поручения отправка открыта правилом, кроме выключенной поштучно и черновиков', () => {
    expect(toolOpenFor('outbound', undefined, 'confirm')).toBe(true)
    expect(toolOpenFor('outbound', undefined, 'free')).toBe(true)
    expect(toolOpenFor('outbound', false, 'confirm')).toBe(false)
    expect(toolOpenFor('outbound', true, 'drafts')).toBe(false)
    expect(toolOpenFor('read', undefined, 'drafts')).toBe(true)
  })

  it('пояснение поручения говорит о подтверждении, а не о выключенной отправке', () => {
    const text = instructionsFor(connector, live, null, null, [], 'confirm')

    expect(text).toContain('waits for the user to confirm')
    expect(text).not.toContain('turned off by the user')
    expect(instructionsFor(connector, live, null, null, [], 'drafts')).toContain(
      'turned off by the user',
    )
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
    expect(instructionsFor(browser, live, null, '/p/other')).toContain('your own tab')
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
      // Правило сообщений людям (ADR 0095) - в пояснении обоих, а не только в описании type.
      expect(text).toMatch(/Messages to people: write paragraphs.*Shift\+(Enter|Return)/)
      // Правило клика (ADR 0119): кнопки, которые отправляют и отменяют, - по ref в Chrome и с
      // expect на компьютере; ответ сверить с намерением.
      expect(text).toMatch(
        kind === 'browser'
          ? /send, accept, decline, delete or pay: only by ref from a fresh snapshot; check the answer's clicked/
          : /Click buttons, menu items, links and fields with expect/,
      )
    }

    // На Windows у Computer Use строкой больше - и она тоже должна влезать.
    const onWindows = instructionsFor(
      { ...connector, kind: 'computer', label: '', account: null, tools: [], description },
      live,
      null,
    ).replace(COMPUTER_GUIDE, computerGuide(true))

    expect(onWindows.length).toBeLessThanOrEqual(CLAUDE_INSTRUCTIONS_MAX)
  })

  // Пояснение самой IDE растёт с каждой её областью (трекер - строкой): описание человека всё равно
  // должно доходить целиком.
  it('пояснение самой IDE с описанием предельной длины укладывается в 2048 знаков', () => {
    const description = 'x'.repeat(CONNECTOR_DESCRIPTION_MAX)
    const text = instructionsFor(
      { ...connector, kind: 'workstation', label: '', account: null, tools: [], description },
      live,
      null,
    )

    expect(text.length).toBeLessThanOrEqual(CLAUDE_INSTRUCTIONS_MAX)
    expect(text).toContain('tracker_add_cards')
    // Раскладка трекера (ADR 0111) - в пояснении: описания инструментов модель видит не сразу.
    expect(text).toContain('Steps of one job are tasks of one group')
    expect(text).toContain('suggest a new flow and wait for a yes')
    expect(text).toContain('aw://tracker/card/<id> is a tracker card')
    expect(text).toContain(description)
  })

  it('пояснение Walkthrough с описанием предельной длины укладывается в 2048 знаков', () => {
    const description = 'x'.repeat(CONNECTOR_DESCRIPTION_MAX)
    const text = instructionsFor(
      { ...connector, kind: 'walkthrough', label: 'Voice', account: null, tools: [], description },
      live,
      null,
    )

    expect(text.length).toBeLessThanOrEqual(CLAUDE_INSTRUCTIONS_MAX)
    // Решения владельца (ADR 0134): везде Computer Use, Browser - только прочитать; метка - до слов.
    expect(text).toContain('Look and act with Computer Use everywhere, Chrome too')
    expect(text).toContain('Mark first, then talk about it')
    expect(text).toContain(description)
  })

  it('описание человека - отдельной строкой, пустое не добавляет ничего', () => {
    const described = { ...connector, description: '  Client mail: invoices only  ' }

    expect(instructionsFor(described, live, null)).toMatch(
      /\nThe user describes this connector: Client mail: invoices only$/,
    )
    expect(instructionsFor(connector, live, null)).not.toContain('describes')
  })
})
