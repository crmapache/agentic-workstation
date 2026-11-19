import { it, vi, expect, describe } from 'vitest'

import type { Environment } from '../process/shell-env'
import type { GitBashDeps } from './git-bash'
import { envValue, findGitBash } from './git-bash'

const VARIABLE = 'KIMI_SHELL_PATH'

/** Машина Windows на словах: какие файлы есть и что отвечает `git --exec-path`. */
const machine = (
  env: Environment,
  files: string[],
  execPaths: Record<string, string> = {},
): GitBashDeps => ({
  env,
  isFile: (path) => Promise.resolve(files.includes(path)),
  run: vi.fn((file: string) => Promise.resolve(execPaths[file] ?? '')),
})

describe('Git Bash для Kimi на Windows', () => {
  it('переменная, которой человек назвал свой bash.exe, - первой', async () => {
    const deps = machine({ KIMI_SHELL_PATH: ' D:\\Git\\bin\\bash.exe ' }, [
      'D:\\Git\\bin\\bash.exe',
    ])

    expect(await findGitBash(VARIABLE, deps)).toBe('D:\\Git\\bin\\bash.exe')
  })

  it('переменная на несуществующий файл - ищем дальше, как Kimi', async () => {
    const deps = machine({ KIMI_SHELL_PATH: 'D:\\nope\\bash.exe' }, [
      'C:\\Program Files\\Git\\bin\\bash.exe',
    ])

    expect(await findGitBash(VARIABLE, deps)).toBe('C:\\Program Files\\Git\\bin\\bash.exe')
  })

  it('git.exe из PATH в папке cmd - bash в корне Git, относительные папки PATH пропускаются', async () => {
    const deps = machine({ Path: 'relative;E:\\PortableGit\\cmd;C:\\Windows' }, [
      'relative\\git.exe',
      'E:\\PortableGit\\cmd\\git.exe',
      'E:\\PortableGit\\usr\\bin\\bash.exe',
    ])

    expect(await findGitBash(VARIABLE, deps)).toBe('E:\\PortableGit\\usr\\bin\\bash.exe')
  })

  it('git за обёрткой (Scoop) - корень по `git --exec-path`', async () => {
    const shim = 'C:\\Users\\me\\scoop\\shims\\git.exe'
    const deps = machine(
      { PATH: 'C:\\Users\\me\\scoop\\shims' },
      [shim, 'C:\\Users\\me\\scoop\\apps\\git\\current\\bin\\bash.exe'],
      { [shim]: 'C:/Users/me/scoop/apps/git/current/mingw64/libexec/git-core\r\n' },
    )

    expect(await findGitBash(VARIABLE, deps)).toBe(
      'C:\\Users\\me\\scoop\\apps\\git\\current\\bin\\bash.exe',
    )
    expect(deps.run).toHaveBeenCalledWith(shim, ['--exec-path'])
  })

  it('обычные места установщика: Program Files, потом папка человека в LOCALAPPDATA', async () => {
    const local = 'C:\\Users\\me\\AppData\\Local'
    const deps = machine({ LocalAppData: local }, [`${local}\\Programs\\Git\\usr\\bin\\bash.exe`])

    expect(await findGitBash(VARIABLE, deps)).toBe(`${local}\\Programs\\Git\\usr\\bin\\bash.exe`)
    expect(
      await findGitBash(VARIABLE, machine({}, ['C:\\Program Files (x86)\\Git\\bin\\bash.exe'])),
    ).toBe('C:\\Program Files (x86)\\Git\\bin\\bash.exe')
  })

  it('нигде нет - null', async () => {
    expect(await findGitBash(VARIABLE, machine({ PATH: 'C:\\Windows' }, []))).toBeNull()
  })

  it('имя переменной без учёта регистра', () => {
    expect(envValue({ Path: 'a' }, 'PATH')).toBe('a')
    expect(envValue({ PATH: 'b' }, 'path')).toBe('b')
    expect(envValue({}, 'PATH')).toBeUndefined()
  })
})
