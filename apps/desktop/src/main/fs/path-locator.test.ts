import { rm, mkdir, mkdtemp, symlink, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, vi, expect, afterAll, describe, beforeAll } from 'vitest'

import { locatePath } from './path-locator'

describe('locatePath', () => {
  let base = ''
  let root = ''
  let home = ''
  let outside = ''
  const files = ['README.md', 'src/App.tsx', 'src/components/Button.js', 'lib/Button.js']
  const listFiles = vi.fn(() => Promise.resolve(files))

  beforeAll(async () => {
    // Настоящий путь: /var/folders на маке - ссылка на /private/var/folders.
    base = await realpath(await mkdtemp(join(tmpdir(), 'agentic-workstation-locate-')))
    root = join(base, 'project')
    home = join(base, 'home')
    outside = join(base, 'elsewhere')

    await mkdir(join(root, 'src', 'components'), { recursive: true })
    await mkdir(join(root, 'lib'))
    await mkdir(join(home, '.claude'), { recursive: true })
    await mkdir(outside)
    await writeFile(join(root, 'README.md'), '')
    await writeFile(join(root, 'src', 'App.tsx'), '')
    await writeFile(join(root, 'src', 'components', 'Button.js'), '')
    await writeFile(join(root, 'lib', 'Button.js'), '')
    await writeFile(join(home, '.claude', 'settings.json'), '')
    await writeFile(join(outside, 'notes.md'), '')
    await symlink(outside, join(root, 'linked'))
  })

  afterAll(() => rm(base, { recursive: true, force: true }))

  const locate = (path: string) => locatePath(root, path, listFiles, home)

  it('путь от корня - файл и папка проекта', async () => {
    expect(await locate('src/App.tsx')).toEqual({
      kind: 'projectFile',
      relativePath: 'src/App.tsx',
    })
    expect(await locate('src/components/')).toEqual({
      kind: 'projectFolder',
      relativePath: 'src/components',
    })
  })

  it('абсолютный путь внутри корня - от корня', async () => {
    expect(await locate(join(root, 'README.md'))).toEqual({
      kind: 'projectFile',
      relativePath: 'README.md',
    })
  })

  it('регистр имени - как на диске, иначе дерево не найдёт строку', async () => {
    if (process.platform !== 'darwin') return

    expect(await locate('src/app.tsx')).toEqual({
      kind: 'projectFile',
      relativePath: 'src/App.tsx',
    })
  })

  it('ссылка внутри проекта, ведущая наружу, - всё равно строка дерева', async () => {
    expect(await locate('linked/notes.md')).toEqual({
      kind: 'projectFile',
      relativePath: 'linked/notes.md',
    })
  })

  it('вне проекта - абсолютный путь, тильда разворачивается', async () => {
    expect(await locate(join(outside, 'notes.md'))).toEqual({
      kind: 'outsideFile',
      absolutePath: join(outside, 'notes.md'),
      editable: true,
    })
    expect(await locate('~/.claude')).toEqual({
      kind: 'outsideFolder',
      absolutePath: join(home, '.claude'),
    })
    expect(await locate('~/.claude/settings.json')).toEqual({
      kind: 'outsideFile',
      absolutePath: join(home, '.claude', 'settings.json'),
      editable: true,
    })
  })

  it('вне проекта: текст - редактору, картинка - своей программе; путь в NFC', async () => {
    const nfd = 'заметки'.normalize('NFD')

    await writeFile(join(outside, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]))
    await writeFile(join(outside, 'latin1.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x21]))
    await writeFile(join(outside, `${nfd}.md`), '# да')

    expect(await locate(join(outside, 'logo.png'))).toMatchObject({ editable: false })
    expect(await locate(join(outside, 'latin1.txt'))).toMatchObject({ editable: false })
    expect(await locate(join(outside, `${nfd}.md`))).toEqual({
      kind: 'outsideFile',
      absolutePath: join(outside, 'заметки.md'.normalize('NFC')),
      editable: true,
    })
  })

  it('голое имя: одно совпадение - файл, несколько - выбор', async () => {
    expect(await locate('App.tsx')).toEqual({ kind: 'projectFile', relativePath: 'src/App.tsx' })
    expect(await locate('Button.js')).toEqual({
      kind: 'choose',
      candidates: ['lib/Button.js', 'src/components/Button.js'],
    })
    expect(await locate('components/Button.js')).toEqual({
      kind: 'projectFile',
      relativePath: 'src/components/Button.js',
    })
  })

  it('нет такого - missing, а тильда и абсолютный путь по имени не ищутся', async () => {
    listFiles.mockClear()

    expect(await locate('Nothing.ts')).toEqual({ kind: 'missing' })
    expect(await locate('~/App.tsx')).toEqual({ kind: 'missing' })
    expect(await locate(join(base, 'gone', 'App.tsx'))).toEqual({ kind: 'missing' })
    expect(listFiles).toHaveBeenCalledTimes(1)
  })

  it('список файлов не спрашивается, когда путь нашёлся как написан', async () => {
    listFiles.mockClear()
    await locate('README.md')

    expect(listFiles).not.toHaveBeenCalled()
  })

  it('сетевой путь - missing, на диск не ходим', async () => {
    expect(await locate('//attacker.example/share/a.ts')).toEqual({ kind: 'missing' })
  })
})
