import { rm, chmod, mkdir, mkdtemp, symlink, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, vi, expect, afterAll, describe, beforeAll, beforeEach } from 'vitest'

import { openOutside, opensSafely } from './outside-open'

const { openPath, showItemInFolder } = vi.hoisted(() => ({
  openPath: vi.fn((_path: string) => Promise.resolve('')),
  showItemInFolder: vi.fn(),
}))

vi.mock('electron', () => ({ shell: { openPath, showItemInFolder } }))

describe('opensSafely', () => {
  it('обычный файл без бита исполнения - открывается', () => {
    expect(opensSafely(['/a/notes.md'], 0o644)).toBe(true)
  })

  it('программа, скрипт, установщик, ярлык - нет', () => {
    for (const name of ['x.app', 'x.command', 'x.sh', 'x.PKG', 'x.dmg', 'x.scpt', 'x.webloc']) {
      expect(opensSafely([`/a/${name}`], 0o644)).toBe(false)
    }
  })

  it('бит исполнения - нет, как бы файл ни назывался', () => {
    expect(opensSafely(['/a/notes.md'], 0o755)).toBe(false)
    expect(opensSafely(['/a/notes.md'], 0o601)).toBe(false)
  })

  it('ссылка с безобидным именем на скрипт - нет', () => {
    expect(opensSafely(['/a/notes.txt', '/b/run.command'], 0o644)).toBe(false)
  })
})

describe('openOutside', () => {
  let base = ''

  beforeAll(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), 'agentic-workstation-outside-')))
    await mkdir(join(base, 'folder'))
    await writeFile(join(base, 'notes.md'), '')
    await writeFile(join(base, 'run.sh'), '')
    await writeFile(join(base, 'tool'), '')
    await chmod(join(base, 'tool'), 0o755)
    await symlink(join(base, 'run.sh'), join(base, 'innocent.txt'))
  })

  afterAll(() => rm(base, { recursive: true, force: true }))

  beforeEach(() => vi.clearAllMocks())

  it('обычный файл открывается своей программой', async () => {
    expect(await openOutside(join(base, 'notes.md'), false)).toBe(true)
    expect(openPath).toHaveBeenCalledWith(join(base, 'notes.md'))
    expect(showItemInFolder).not.toHaveBeenCalled()
  })

  it('папка, скрипт, исполняемый, ссылка на скрипт - только в Finder', async () => {
    for (const name of ['folder', 'run.sh', 'tool', 'innocent.txt']) {
      expect(await openOutside(join(base, name), false)).toBe(true)
    }

    expect(openPath).not.toHaveBeenCalled()
    expect(showItemInFolder).toHaveBeenCalledTimes(4)
  })

  it('просьба показать - показывает и файл', async () => {
    expect(await openOutside(join(base, 'notes.md'), true)).toBe(true)
    expect(showItemInFolder).toHaveBeenCalledWith(join(base, 'notes.md'))
    expect(openPath).not.toHaveBeenCalled()
  })

  it('программы для файла нет - показывает в Finder', async () => {
    openPath.mockResolvedValueOnce('no application')

    expect(await openOutside(join(base, 'notes.md'), false)).toBe(true)
    expect(showItemInFolder).toHaveBeenCalledWith(join(base, 'notes.md'))
  })

  it('нет файла, относительный, сетевой путь - false и ничего не трогает', async () => {
    expect(await openOutside(join(base, 'gone.md'), false)).toBe(false)
    expect(await openOutside('notes.md', false)).toBe(false)
    expect(await openOutside('//host/share/a.md', false)).toBe(false)
    expect(openPath).not.toHaveBeenCalled()
    expect(showItemInFolder).not.toHaveBeenCalled()
  })
})
