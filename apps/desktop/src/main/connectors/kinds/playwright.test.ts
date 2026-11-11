import { it, expect, describe } from 'vitest'

import { blankConnector } from '../connector-store'
import { asPlaywright, playwrightCommand, playwrightOptionsOf } from './playwright'

const isolated = ['-y', '@playwright/mcp@latest', '--isolated', '--headless']
const saved = [
  '-y',
  '@playwright/mcp@0.0.78',
  '--user-data-dir',
  '/u/profiles/notion',
  '--headless',
]

describe('команда Playwright', () => {
  it('собирается из настроек и узнаётся обратно', () => {
    const command = playwrightCommand({ version: 'latest', profileDir: null, headless: true })

    expect(command).toEqual({ command: 'npx', args: isolated, cwd: null })
    expect(playwrightOptionsOf(command)).toEqual({
      version: 'latest',
      profileDir: null,
      headless: true,
    })
    expect(playwrightOptionsOf({ command: 'npx', args: saved, cwd: null })).toEqual({
      version: '0.0.78',
      profileDir: '/u/profiles/notion',
      headless: true,
    })
  })

  it('свои флаги, общий профиль, своя папка запуска, чужой пакет - не Playwright', () => {
    const npx = (args: string[], cwd: string | null = null) => ({ command: 'npx', args, cwd })

    expect(playwrightOptionsOf(npx([...isolated, '--browser', 'firefox']))).toBeNull()
    expect(playwrightOptionsOf(npx(['-y', '@playwright/mcp@latest']))).toBeNull()
    expect(playwrightOptionsOf(npx(isolated, '/p'))).toBeNull()
    expect(playwrightOptionsOf(npx(['-y', '@other/mcp@latest', '--isolated']))).toBeNull()
    expect(playwrightOptionsOf(npx(['-y', '@playwright/mcp@$(rm)', '--isolated']))).toBeNull()
  })
})

describe('asPlaywright', () => {
  const command = (serverName: string, args: string[]) => ({
    ...blankConnector({ id: serverName, kind: 'command', label: '', serverName }),
    typeId: 't',
    command: { command: 'npx', args, cwd: null },
  })

  it('подпись из имени сервера, имя сервера и команда те же, своего типа нет', () => {
    expect(asPlaywright(command('playwright-1', isolated), {})).toMatchObject({
      kind: 'playwright',
      typeId: null,
      label: '1',
      serverName: 'playwright-1',
      command: { args: isolated },
    })
    expect(asPlaywright(command('notion-web', saved), {})).toMatchObject({ label: 'Notion Web' })
  })

  it('команда с секретами или не Playwright - остаётся своей', () => {
    expect(asPlaywright(command('playwright-1', isolated), { env: { K: 'v' } })).toBeNull()
    expect(asPlaywright(command('chatkepr', ['/x.js']), {})).toBeNull()
  })
})
