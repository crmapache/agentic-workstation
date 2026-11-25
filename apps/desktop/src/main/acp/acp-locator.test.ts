import { it, vi, expect, describe } from 'vitest'

import type { Environment } from '../process/shell-env'
import type { AcpCliSpec, LocatorDeps } from './acp-locator'
import { atLeast, versionIn, candidatesOf, searchAcpCli } from './acp-locator'

const KIMI: AcpCliSpec = {
  name: 'kimi',
  macDirs: ['.kimi-code/bin'],
  windowsDirs: [['USERPROFILE', '.kimi-code\\bin']],
  minimum: '2.0.0',
  gitBash: { variable: 'KIMI_SHELL_PATH' },
}

const AGY: AcpCliSpec = {
  name: 'agy',
  macDirs: ['.local/bin'],
  windowsDirs: [['LOCALAPPDATA', 'agy\\bin']],
  minimum: '1.5.10',
}

/** Машина на словах: файлы с их ответом на `--version`, окружение, ответ оболочки и текст обёрток .cmd. */
const machine = (
  windows: boolean,
  env: Environment,
  files: Record<string, string>,
  shell: string | null = null,
  shims: Record<string, string> = {},
): LocatorDeps => ({
  windows,
  env,
  home: '/Users/me',
  isFile: (path) => Promise.resolve(path in files),
  readText: (path) => Promise.resolve(shims[path] ?? ''),
  run: (file, args) => Promise.resolve(args[0] === '--version' ? (files[file] ?? '') : ''),
  askShell: vi.fn(() => Promise.resolve(shell)),
})

describe('версия CLI агента', () => {
  it('первая x.y.z из вывода; нет - пусто', () => {
    expect(versionIn('kimi, version 2.7.0\n')).toBe('2.7.0')
    expect(versionIn('agy 1.5.12 (5281398513336320)')).toBe('1.5.12')
    expect(versionIn('nothing')).toBe('')
  })

  it('порог по числам; неизвестная версия - годная', () => {
    expect(atLeast('2.7.0', '2.0.0')).toBe(true)
    expect(atLeast('2.0.0', '2.0.0')).toBe(true)
    expect(atLeast('1.50.0', '2.0.0')).toBe(false)
    expect(atLeast('1.5.9', '1.5.10')).toBe(false)
    expect(atLeast('', '2.0.0')).toBe(true)
  })
})

describe('поиск CLI на маке', () => {
  it('PATH login shell - первым', async () => {
    const deps = machine(
      false,
      { PATH: '/usr/bin:/opt/homebrew/bin' },
      {
        '/opt/homebrew/bin/kimi': 'kimi, version 2.6.3',
      },
    )

    expect(await searchAcpCli(KIMI, deps)).toEqual({
      cli: { binary: '/opt/homebrew/bin/kimi', env: deps.env, version: '2.6.3' },
      need: null,
    })
    expect(deps.askShell).not.toHaveBeenCalled()
  })

  it('старый в PATH (Kimi 1.x из Homebrew) не заслоняет новый в папке установщика', async () => {
    const deps = machine(
      false,
      { PATH: '/opt/homebrew/bin' },
      {
        '/opt/homebrew/bin/kimi': 'kimi, version 1.50.0',
        '/Users/me/.kimi-code/bin/kimi': 'kimi, version 2.7.0',
      },
    )

    expect((await searchAcpCli(KIMI, deps)).cli?.binary).toBe('/Users/me/.kimi-code/bin/kimi')
  })

  it('нет в PATH - папка установщика от домашней', async () => {
    const deps = machine(false, { PATH: '/usr/bin' }, { '/Users/me/.local/bin/agy': 'agy 1.5.12' })

    expect((await searchAcpCli(AGY, deps)).cli?.binary).toBe('/Users/me/.local/bin/agy')
  })

  it('нигде в папках - спросить оболочку (менеджер версий node)', async () => {
    const nvm = '/Users/me/.nvm/versions/node/v22.19.0/bin/kimi'
    const deps = machine(false, { PATH: '/usr/bin' }, { [nvm]: '' }, nvm)

    expect((await searchAcpCli(KIMI, deps)).cli).toEqual({
      binary: nvm,
      env: deps.env,
      version: '',
    })
    expect(deps.askShell).toHaveBeenCalledWith('kimi')
  })

  it('только ниже порога - CLI нет, и ставить надо его самого', async () => {
    const deps = machine(
      false,
      { PATH: '/opt/homebrew/bin' },
      {
        '/opt/homebrew/bin/agy': 'agy 1.5.9',
      },
    )

    expect(await searchAcpCli(AGY, deps)).toEqual({ cli: null, need: null })
  })

  it('Git Bash на маке не нужен', async () => {
    const deps = machine(false, { PATH: '/usr/bin' }, { '/usr/bin/kimi': '2.7.0' })

    expect((await searchAcpCli(KIMI, deps)).cli?.binary).toBe('/usr/bin/kimi')
  })
})

describe('поиск CLI на Windows', () => {
  const local = 'C:\\Users\\me\\AppData\\Local'
  const roaming = 'C:\\Users\\me\\AppData\\Roaming'
  const bash = 'C:\\Program Files\\Git\\bin\\bash.exe'

  it('PATH по порядку папок («;»), в одной папке .exe раньше обёртки .cmd', async () => {
    const deps = machine(
      true,
      { Path: `C:\\Windows;${roaming}\\npm;C:\\tools` },
      {
        [`${roaming}\\npm\\kimi.cmd`]: '2.7.0',
        'C:\\tools\\kimi.exe': '2.7.0',
        [bash]: '',
      },
    )

    expect((await searchAcpCli(KIMI, deps)).cli?.binary).toBe(`${roaming}\\npm\\kimi.cmd`)
    expect(candidatesOf(KIMI, deps).slice(0, 4)).toEqual([
      'C:\\Windows\\kimi.exe',
      'C:\\Windows\\kimi.cmd',
      `${roaming}\\npm\\kimi.exe`,
      `${roaming}\\npm\\kimi.cmd`,
    ])
  })

  it('PATH процесса не знает папку (IDE открыта до установки) - %LOCALAPPDATA%\\agy\\bin', async () => {
    const deps = machine(
      true,
      { PATH: 'C:\\Windows', LocalAppData: local },
      {
        [`${local}\\agy\\bin\\agy.exe`]: 'agy 1.5.12',
      },
    )

    expect((await searchAcpCli(AGY, deps)).cli?.binary).toBe(`${local}\\agy\\bin\\agy.exe`)
    expect(deps.askShell).not.toHaveBeenCalled()
  })

  it('Kimi: %USERPROFILE%\\.kimi-code\\bin, ярлык winget, глобальный npm', async () => {
    const env = { USERPROFILE: 'C:\\Users\\me', LOCALAPPDATA: local, APPDATA: roaming }
    const at = async (file: string) =>
      (await searchAcpCli(KIMI, machine(true, env, { [file]: '2.7.0', [bash]: '' }))).cli?.binary

    expect(await at('C:\\Users\\me\\.kimi-code\\bin\\kimi.exe')).toBe(
      'C:\\Users\\me\\.kimi-code\\bin\\kimi.exe',
    )
    expect(await at(`${local}\\Microsoft\\WinGet\\Links\\kimi.exe`)).toBe(
      `${local}\\Microsoft\\WinGet\\Links\\kimi.exe`,
    )
    expect(await at(`${roaming}\\npm\\kimi.cmd`)).toBe(`${roaming}\\npm\\kimi.cmd`)
  })

  it('обёртка npm над программой - сама программа, без cmd.exe; над скриптом - обёртка', async () => {
    const shim = `${roaming}\\npm\\agy.cmd`
    const program = `${roaming}\\npm\\node_modules\\agy-cli\\bin\\agy.exe`
    const env = { APPDATA: roaming }
    const viaProgram = machine(true, env, { [shim]: '', [program]: 'agy 1.5.12' }, null, {
      [shim]: '"%dp0%\\node_modules\\agy-cli\\bin\\agy.exe"   %*\r\n',
    })
    const viaScript = machine(true, env, { [shim]: 'agy 1.5.12' }, null, {
      [shim]: '"%_prog%"  "%dp0%\\node_modules\\agy-cli\\bin\\agy.js" %*\r\n',
    })

    expect((await searchAcpCli(AGY, viaProgram)).cli?.binary).toBe(program)
    expect((await searchAcpCli(AGY, viaScript)).cli?.binary).toBe(shim)
  })

  it('папка из PATH и папка установщика - один кандидат, регистр не важен', () => {
    const deps = machine(
      true,
      { PATH: `${local.toUpperCase()}\\AGY\\BIN`, LOCALAPPDATA: local },
      {},
    )
    const names = candidatesOf(AGY, deps).map((file) => file.toLowerCase())

    expect(
      names.filter((file) => file === `${local}\\agy\\bin\\agy.exe`.toLowerCase()),
    ).toHaveLength(1)
  })

  it('Kimi без Git Bash - CLI нет, а нужен Git Bash', async () => {
    const deps = machine(
      true,
      { USERPROFILE: 'C:\\Users\\me' },
      {
        'C:\\Users\\me\\.kimi-code\\bin\\kimi.exe': '2.7.0',
      },
    )

    expect(await searchAcpCli(KIMI, deps)).toEqual({ cli: null, need: 'git-bash' })
  })

  it('Kimi с Git Bash - найден; без самого Kimi Git Bash не спрашивается', async () => {
    const found = machine(
      true,
      { USERPROFILE: 'C:\\Users\\me' },
      {
        'C:\\Users\\me\\.kimi-code\\bin\\kimi.exe': '2.7.0',
        [bash]: '',
      },
    )

    expect((await searchAcpCli(KIMI, found)).cli?.binary).toBe(
      'C:\\Users\\me\\.kimi-code\\bin\\kimi.exe',
    )
    expect(await searchAcpCli(KIMI, machine(true, { PATH: 'C:\\Windows' }, {}))).toEqual({
      cli: null,
      need: null,
    })
  })

  it('Antigravity Git Bash не нужен', async () => {
    const deps = machine(
      true,
      { LOCALAPPDATA: local },
      { [`${local}\\agy\\bin\\agy.exe`]: '1.5.12' },
    )

    expect(await searchAcpCli(AGY, deps)).toMatchObject({ need: null })
    expect((await searchAcpCli(AGY, deps)).cli).not.toBeNull()
  })
})
