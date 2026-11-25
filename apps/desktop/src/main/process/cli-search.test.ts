import { it, expect, describe } from 'vitest'

import type { CliSearchDeps } from './cli-search'
import { pathDirs, shimTarget, commandDirs, candidatesIn, findCommandIn } from './cli-search'
import type { Environment } from './shell-env'

const HOME = 'C:\\Users\\me'
const LOCAL = `${HOME}\\AppData\\Local`
const ROAMING = `${HOME}\\AppData\\Roaming`

/** Окружение Windows человека, как его видит IDE: PATH процесса и папки профиля. */
const WINDOWS_ENV: Environment = {
  Path: 'C:\\Windows\\system32;C:\\Windows',
  USERPROFILE: HOME,
  LOCALAPPDATA: LOCAL,
  APPDATA: ROAMING,
  ProgramFiles: 'C:\\Program Files',
  ProgramData: 'C:\\ProgramData',
}

/** Обёртка npm (cmd-shim) над программой - так npm ставит claude из @anthropic-ai/claude-code. */
const NPM_PROGRAM_SHIM = [
  '@ECHO off',
  'GOTO start',
  ':find_dp0',
  'SET dp0=%~dp0',
  'EXIT /b',
  ':start',
  'SETLOCAL',
  'CALL :find_dp0',
  '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*',
  '',
].join('\r\n')

/** Обёртка npm над скриптом node - так npm ставит codex из @openai/codex. */
const NPM_SCRIPT_SHIM = [
  '@ECHO off',
  'GOTO start',
  ':find_dp0',
  'SET dp0=%~dp0',
  'EXIT /b',
  ':start',
  'SETLOCAL',
  'CALL :find_dp0',
  '',
  'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"',
  ') ELSE (',
  '  SET "_prog=node"',
  '  SET PATHEXT=%PATHEXT:;.JS;=;%',
  ')',
  '',
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*',
  '',
].join('\r\n')

/** Обёртка pnpm (@zkochan/cmd-shim) над программой: путь от `%~dp0`, перед ним NODE_PATH. */
const PNPM_PROGRAM_SHIM = [
  '@SETLOCAL',
  '@IF NOT DEFINED NODE_PATH (',
  `  @SET "NODE_PATH=${LOCAL}\\pnpm\\global\\5\\node_modules\\.pnpm\\node_modules"`,
  ') ELSE (',
  `  @SET "NODE_PATH=${LOCAL}\\pnpm\\global\\5\\node_modules\\.pnpm\\node_modules;%NODE_PATH%"`,
  ')',
  '@"%~dp0\\global\\5\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*',
  '',
].join('\r\n')

/** Машина на словах: какие файлы есть и что в них написано. */
const machine = (
  windows: boolean,
  env: Environment,
  files: Record<string, string>,
): CliSearchDeps => ({
  windows,
  env,
  isFile: (path) => Promise.resolve(path in files),
  readText: (path) => Promise.resolve(files[path] ?? ''),
})

const findClaude = (deps: CliSearchDeps) =>
  findCommandIn('claude', commandDirs(deps.env, deps.windows), deps, 'program')

describe('Claude Code на Windows', () => {
  it('родной установщик: %USERPROFILE%\\.local\\bin\\claude.exe, даже когда его нет в PATH', async () => {
    const native = `${HOME}\\.local\\bin\\claude.exe`

    expect(await findClaude(machine(true, WINDOWS_ENV, { [native]: '' }))).toBe(native)
  })

  it('winget: ярлык в Links на человека и на машину', async () => {
    const user = `${LOCAL}\\Microsoft\\WinGet\\Links\\claude.exe`
    const system = 'C:\\Program Files\\WinGet\\Links\\claude.exe'

    expect(await findClaude(machine(true, WINDOWS_ENV, { [user]: '' }))).toBe(user)
    expect(await findClaude(machine(true, WINDOWS_ENV, { [system]: '' }))).toBe(system)
  })

  it('npm -g: вместо обёртки claude.cmd - её claude.exe, без cmd.exe', async () => {
    const shim = `${ROAMING}\\npm\\claude.cmd`
    const program = `${ROAMING}\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`
    const deps = machine(true, WINDOWS_ENV, { [shim]: NPM_PROGRAM_SHIM, [program]: '' })

    expect(await findClaude(deps)).toBe(program)
  })

  it('pnpm -g: обёртка от `%~dp0` - тоже её claude.exe', async () => {
    const shim = `${LOCAL}\\pnpm\\claude.cmd`
    const program = `${LOCAL}\\pnpm\\global\\5\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`
    const deps = machine(true, WINDOWS_ENV, { [shim]: PNPM_PROGRAM_SHIM, [program]: '' })

    expect(await findClaude(deps)).toBe(program)
  })

  it('npm со своим prefix: обёртка в папке из PATH', async () => {
    const shim = 'D:\\tools\\npm\\claude.cmd'
    const program = 'D:\\tools\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe'
    const env = { ...WINDOWS_ENV, Path: `C:\\Windows;"D:\\tools\\npm" ` }

    expect(await findClaude(machine(true, env, { [shim]: NPM_PROGRAM_SHIM, [program]: '' }))).toBe(
      program,
    )
  })

  it('Scoop: своя папка SCOOP и обычная в профиле', async () => {
    const custom = 'D:\\scoop\\shims\\claude.exe'
    const usual = `${HOME}\\scoop\\shims\\claude.exe`

    expect(
      await findClaude(machine(true, { ...WINDOWS_ENV, SCOOP: 'D:\\scoop' }, { [custom]: '' })),
    ).toBe(custom)
    expect(await findClaude(machine(true, WINDOWS_ENV, { [usual]: '' }))).toBe(usual)
  })

  it('обёртка над скриптом (старый пакет npm) - не Claude, ищем дальше', async () => {
    const shim = `${ROAMING}\\npm\\claude.cmd`
    const native = `${HOME}\\.local\\bin\\claude.exe`
    const deps = machine(true, WINDOWS_ENV, { [shim]: NPM_SCRIPT_SHIM, [native]: '' })

    expect(await findClaude(deps)).toBe(native)
    expect(await findClaude(machine(true, WINDOWS_ENV, { [shim]: NPM_SCRIPT_SHIM }))).toBeNull()
  })

  it('обёртка, чьей программы нет (npm без optional), - не Claude', async () => {
    const shim = `${ROAMING}\\npm\\claude.cmd`

    expect(await findClaude(machine(true, WINDOWS_ENV, { [shim]: NPM_PROGRAM_SHIM }))).toBeNull()
  })

  it('PATH раньше папок установщиков, в одной папке .exe раньше .cmd', async () => {
    const inPath = 'C:\\tools\\claude.exe'
    const env = { ...WINDOWS_ENV, Path: 'C:\\tools' }
    const deps = machine(true, env, { [inPath]: '', [`${HOME}\\.local\\bin\\claude.exe`]: '' })

    expect(await findClaude(deps)).toBe(inPath)
    expect(candidatesIn(['C:\\tools'], 'claude', true)).toEqual([
      'C:\\tools\\claude.exe',
      'C:\\tools\\claude.cmd',
    ])
  })

  it('ничего нет - null', async () => {
    expect(await findClaude(machine(true, WINDOWS_ENV, {}))).toBeNull()
  })
})

describe('Codex и OpenCode на Windows', () => {
  it('Codex из npm - обёртка над codex.js, её запускает cmd.exe', async () => {
    const shim = `${ROAMING}\\npm\\codex.cmd`
    const deps = machine(true, WINDOWS_ENV, { [shim]: NPM_SCRIPT_SHIM })
    const dirs = commandDirs(deps.env, true)

    expect(await findCommandIn('codex', dirs, deps, 'program-or-batch')).toBe(shim)
    expect(await findCommandIn('codex', dirs, deps, 'program')).toBeNull()
  })

  it('OpenCode из npm - его opencode.exe за обёрткой', async () => {
    const shim = `${ROAMING}\\npm\\opencode.cmd`
    const program = `${ROAMING}\\npm\\node_modules\\opencode-ai\\bin\\opencode.exe`
    const text = '"%dp0%\\node_modules\\opencode-ai\\bin\\opencode.exe"   %*\r\n'
    const deps = machine(true, WINDOWS_ENV, { [shim]: text, [program]: '' })

    expect(
      await findCommandIn('opencode', commandDirs(deps.env, true), deps, 'program-or-batch'),
    ).toBe(program)
  })
})

describe('папки поиска', () => {
  it('PATH Windows: «;», ключ без регистра, без кавычек и пробелов, только абсолютные', () => {
    expect(pathDirs({ Path: ' C:\\a ;relative;"C:\\Program Files\\b";;C:c' }, true)).toEqual([
      'C:\\a',
      'C:\\Program Files\\b',
    ])
  })

  it('папки установщиков - после PATH, без повторов и без несуществующих переменных', () => {
    const dirs = commandDirs({ PATH: `${HOME}\\.local\\bin`, USERPROFILE: HOME }, true)
    const files = candidatesIn(dirs, 'claude', true).map((file) => file.toLowerCase())

    expect(dirs[0]).toBe(`${HOME}\\.local\\bin`)
    expect(
      files.filter((file) => file === `${HOME}\\.local\\bin\\claude.exe`.toLowerCase()),
    ).toHaveLength(1)
    expect(dirs.some((dir) => dir.includes('WinGet'))).toBe(false)
  })

  it('на маке - только PATH, имя без расширения', async () => {
    const deps = machine(
      false,
      { PATH: '/usr/bin:relative:/opt/homebrew/bin' },
      {
        '/opt/homebrew/bin/claude': '',
      },
    )

    expect(commandDirs(deps.env, false)).toEqual(['/usr/bin', '/opt/homebrew/bin'])
    expect(await findClaude(deps)).toBe('/opt/homebrew/bin/claude')
  })

  it('имя с расширением на Windows - как есть (программа расширения `git.exe`)', () => {
    expect(candidatesIn(['C:\\Git\\cmd'], 'git.exe', true)).toEqual(['C:\\Git\\cmd\\git.exe'])
    expect(candidatesIn(['C:\\Git\\cmd'], 'git', true)).toEqual([
      'C:\\Git\\cmd\\git.exe',
      'C:\\Git\\cmd\\git.cmd',
    ])
  })
})

describe('программа за обёрткой .cmd', () => {
  it('npm над программой, npm над скриптом, pnpm, Yarn', () => {
    expect(shimTarget(NPM_PROGRAM_SHIM, `${ROAMING}\\npm\\claude.cmd`)).toBe(
      `${ROAMING}\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`,
    )
    expect(shimTarget(NPM_SCRIPT_SHIM, `${ROAMING}\\npm\\codex.cmd`)).toBe(
      `${ROAMING}\\npm\\node_modules\\@openai\\codex\\bin\\codex.js`,
    )
    expect(shimTarget(PNPM_PROGRAM_SHIM, `${LOCAL}\\pnpm\\claude.cmd`)).toBe(
      `${LOCAL}\\pnpm\\global\\5\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`,
    )
    expect(
      shimTarget(
        '@"%~dp0\\..\\Data\\global\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*\r\n',
        `${LOCAL}\\Yarn\\bin\\claude.cmd`,
      ),
    ).toBe(
      `${LOCAL}\\Yarn\\Data\\global\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`,
    )
  })

  it('свой батник человека - не обёртка', () => {
    expect(
      shimTarget('@echo off\r\nC:\\tools\\claude.exe %*\r\n', 'C:\\tools\\claude.cmd'),
    ).toBeNull()
    expect(shimTarget('', 'C:\\tools\\claude.cmd')).toBeNull()
  })
})
