import { rm, chmod, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { checkCliPath, searchedPlaces } from './cli-path'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cli-path-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** Исполняемый скрипт, который отвечает на --version заданной строкой. */
const fakeCli = async (name: string, version: string) => {
  const file = join(dir, name)

  await writeFile(file, `#!/bin/sh\necho '${version}'\n`)
  await chmod(file, 0o755)

  return file
}

describe('путь к CLI руками', () => {
  it('отвечает как Claude Code - годный, запускается он сам', async () => {
    const file = await fakeCli('claude', '2.1.293 (Claude Code)')

    expect(await checkCliPath(file, { PATH: '/usr/bin:/bin' })).toEqual({
      binary: file,
      refusal: null,
    })
  })

  it('другая программа - не Claude Code', async () => {
    const file = await fakeCli('claude', 'something else 1.0')

    expect(await checkCliPath(file, { PATH: '/usr/bin:/bin' })).toEqual({
      binary: null,
      refusal: 'not-claude',
    })
  })

  it('нет файла или путь не абсолютный', async () => {
    expect((await checkCliPath(join(dir, 'nope'), {})).refusal).toBe('missing')
    expect((await checkCliPath('claude', {})).refusal).toBe('missing')
  })

  it('где искали на маке: названный путь, папки PATH без повторов и оболочка', () => {
    expect(searchedPlaces({ PATH: '/a:/b::/a' }, '/opt/claude', false)).toEqual([
      '/opt/claude',
      '/a/claude',
      '/b/claude',
      'command -v claude',
    ])
  })

  it('где искали на Windows: PATH, потом папки установщика, winget и npm; без оболочки', () => {
    const places = searchedPlaces(
      {
        Path: 'C:\\tools',
        USERPROFILE: 'C:\\Users\\me',
        LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
        APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
      },
      '',
      true,
    )

    expect(places.slice(0, 4)).toEqual([
      'C:\\tools\\claude.exe',
      'C:\\tools\\claude.cmd',
      'C:\\Users\\me\\.local\\bin\\claude.exe',
      'C:\\Users\\me\\.local\\bin\\claude.cmd',
    ])
    expect(places).toContain('C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Links\\claude.exe')
    expect(places).toContain('C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd')
    expect(places.some((place) => place.startsWith('command -v'))).toBe(false)
  })
})
