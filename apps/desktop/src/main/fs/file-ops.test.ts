import { rm, mkdir, mkdtemp, readdir, symlink, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { copyName, childPath } from './file-ops'
import { FileOpsService } from './file-ops-service'

/**
 * Действия из дерева на настоящей папке: создать, переименовать с правкой ссылок, скопировать,
 * в корзину - и отказы, которые окно показывает словами.
 */

let root = ''
let trashed: string[] = []

const listFiles = async (dir: string) => {
  const paths: string[] = []
  const walk = async (relative: string) => {
    for (const entry of await readdir(join(dir, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name

      if (entry.isDirectory()) await walk(path)
      else paths.push(path)
    }
  }

  await walk('')

  return { paths, truncated: false }
}

const files = () =>
  new FileOpsService({
    listFiles,
    trash: async (absolute) => {
      trashed.push(absolute)
      await rm(absolute, { recursive: true })
    },
  })

const put = async (path: string, text: string) => {
  await mkdir(join(root, path, '..'), { recursive: true })
  await writeFile(join(root, path), text)
}

const read = (path: string) => readFile(join(root, path), 'utf8')

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'file-ops-'))
  trashed = []
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('действия с файлами из дерева', () => {
  it('новый файл с подпапками в имени, занятое имя и негодное - отказ', async () => {
    const service = files()

    expect(await service.create(root, 'src', 'ui/Button.tsx', 'file')).toEqual({
      ok: true,
      path: 'src/ui/Button.tsx',
    })
    expect(await read('src/ui/Button.tsx')).toBe('')
    expect(await service.create(root, 'src', 'ui/Button.tsx', 'file')).toEqual({
      ok: false,
      code: 'exists',
    })
    expect(await service.create(root, '', '../out.ts', 'file')).toEqual({
      ok: false,
      code: 'invalidName',
    })
    expect(await service.create(root, '', 'docs', 'directory')).toEqual({ ok: true, path: 'docs' })
  })

  it('переименование правит ссылки, план до него говорит, где они', async () => {
    const service = files()

    await put('src/Foo.ts', 'export const foo = 1')
    await put('src/a.ts', "import { foo } from './Foo'")
    await put('README.md', '[foo](src/Foo.ts)')

    const move = { from: 'src/Foo.ts', to: 'src/Bar.ts' }

    expect(await service.references(root, move)).toEqual({
      files: [
        { path: 'README.md', count: 1 },
        { path: 'src/a.ts', count: 1 },
      ],
      total: 2,
      truncated: false,
    })
    expect(await service.move(root, move, true)).toEqual({
      ok: true,
      path: 'src/Bar.ts',
      references: 2,
      files: 2,
      skipped: 0,
    })
    expect(await read('src/a.ts')).toBe("import { foo } from './Bar'")
    expect(await read('README.md')).toBe('[foo](src/Bar.ts)')
  })

  it('без правки ссылок - только перенос; в себя и на занятое - отказ', async () => {
    const service = files()

    await put('src/Foo.ts', '')
    await put('src/a.ts', "import './Foo'")
    await put('src/b.ts', '')

    expect(await service.move(root, { from: 'src', to: 'src/inner' }, true)).toEqual({
      ok: false,
      code: 'intoItself',
    })
    expect(await service.move(root, { from: 'src/Foo.ts', to: 'src/b.ts' }, true)).toEqual({
      ok: false,
      code: 'exists',
    })
    expect(await service.move(root, { from: 'src/Foo.ts', to: 'lib/Foo.ts' }, false)).toMatchObject(
      { ok: true, references: 0 },
    )
    expect(await read('src/a.ts')).toBe("import './Foo'")
  })

  it('ссылка на файл не переносится на свою же цель: настоящий файл цел', async () => {
    await put('AGENTS.md', 'rules')
    await symlink('AGENTS.md', join(root, 'CLAUDE.md'))

    expect(await files().move(root, { from: 'CLAUDE.md', to: 'AGENTS.md' }, false)).toEqual({
      ok: false,
      code: 'exists',
    })
    expect(await read('AGENTS.md')).toBe('rules')
  })

  it('файл не в UTF-8 со ссылкой не трогается: правка не портит его байты', async () => {
    const legacy = Buffer.from([0x3c, 0x61, 0x20, 0x68, 0x72, 0x65, 0x66, 0x3d, 0x22]) // <a href="
    const bytes = Buffer.concat([
      legacy,
      Buffer.from('about.html">'),
      Buffer.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]), // «Привет» в cp1251
      Buffer.from('</a>'),
    ])

    await put('about.html', 'x')
    await mkdir(join(root, 'old'), { recursive: true })
    await writeFile(join(root, 'old/index.html'), bytes)

    await files().move(root, { from: 'about.html', to: 'info.html' }, true)

    expect((await readFile(join(root, 'old/index.html'))).equals(bytes)).toBe(true)
  })

  it('смена одного регистра - то же место, а не «занято»', async () => {
    await put('src/foo.ts', 'x')

    expect(await files().move(root, { from: 'src/foo.ts', to: 'src/Foo.ts' }, false)).toMatchObject(
      {
        ok: true,
        path: 'src/Foo.ts',
      },
    )
    expect(await readdir(join(root, 'src'))).toEqual(['Foo.ts'])
  })

  it('копия под свободным именем, папка в себя не копируется', async () => {
    const service = files()

    await put('src/a.ts', 'a')

    expect(await service.copy(root, 'src/a.ts', 'src')).toEqual({ ok: true, path: 'src/a copy.ts' })
    expect(await service.copy(root, 'src/a.ts', 'src')).toEqual({
      ok: true,
      path: 'src/a copy 2.ts',
    })
    expect(await service.copy(root, 'src', 'src')).toEqual({ ok: false, code: 'intoItself' })
    expect(await service.copy(root, 'src', '')).toEqual({ ok: true, path: 'src copy' })
    expect(await read('src copy/a.ts')).toBe('a')
  })

  it('корень проекта и пути не в виде дерева - отказ, а не весь проект в корзине', async () => {
    const service = files()

    await put('src/a.ts', '')

    for (const path of ['.', 'src/..', './src/a.ts', 'src//a.ts', '/etc/hosts', '../x']) {
      expect(await service.trash(root, path)).toEqual({ ok: false, code: 'invalidName' })
      expect(await service.move(root, { from: path, to: 'b.ts' }, true)).toEqual({
        ok: false,
        code: 'invalidName',
      })
    }

    expect(await service.create(root, '.', 'x.ts', 'file')).toEqual({
      ok: false,
      code: 'invalidName',
    })
    expect(trashed).toEqual([])
    expect(await read('src/a.ts')).toBe('')
  })

  it('битая «%» в ссылке Markdown не мешает переименованию', async () => {
    await put('docs/100%.md', 'x')
    await put('docs/a.md', '[p](100%.md) [b](b.md)')
    await put('docs/b.md', 'b')

    expect(await files().move(root, { from: 'docs/b.md', to: 'docs/c.md' }, true)).toMatchObject({
      ok: true,
      references: 1,
    })
    expect(await read('docs/a.md')).toBe('[p](100%.md) [b](c.md)')
  })

  it('в корзину - через систему; того, чего нет, нет', async () => {
    const service = files()

    await put('old.ts', '')

    expect(await service.trash(root, 'old.ts')).toEqual({ ok: true, path: 'old.ts' })
    expect(trashed).toEqual([join(root, 'old.ts')])
    expect(await service.trash(root, 'old.ts')).toEqual({ ok: false, code: 'missing' })
    expect(await service.trash(root, '')).toEqual({ ok: false, code: 'invalidName' })
  })

  it('локальной истории - перенос в её очереди, правка ссылок своей причиной, корзина', async () => {
    const calls: string[] = []
    const service = new FileOpsService({
      listFiles,
      trash: async (absolute) => rm(absolute, { recursive: true }),
      history: {
        expect: (_root, path, cause) => void calls.push(`expect ${path} ${cause}`),
        settle: (_root, paths, cause) => {
          calls.push(`settle ${paths.join(',')} ${cause ?? '-'}`)

          return Promise.resolve()
        },
        move: async (_root, from, rename) => {
          const outcome = await rename()

          calls.push(`move ${from} ${outcome.ok ? outcome.path : 'failed'}`)

          return outcome
        },
      },
    })

    await put('src/Foo.ts', '')
    await put('src/a.ts', "import './Foo'")
    await service.move(root, { from: 'src/Foo.ts', to: 'src/Bar.ts' }, true)
    await service.trash(root, 'src/a.ts')

    expect(calls).toEqual([
      'move src/Foo.ts src/Bar.ts',
      'expect src/a.ts refactor',
      'settle src/a.ts refactor',
      'settle src/a.ts -',
      'settle src/a.ts -',
    ])
  })

  it('имена: подпапки в имени, копии как в Finder', () => {
    expect(childPath('', 'a/b.ts')).toBe('a/b.ts')
    expect(childPath('src', ' x.ts ')).toBe('src/x.ts')
    expect(childPath('src', 'a//b')).toBeNull()
    expect(copyName('a.ts', new Set(['a.ts', 'a copy.ts']))).toBe('a copy 2.ts')
    expect(copyName('Makefile', new Set(['Makefile']))).toBe('Makefile copy')
  })
})
