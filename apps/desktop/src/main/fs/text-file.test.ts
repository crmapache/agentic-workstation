import { execFileSync } from 'node:child_process'
import {
  rm,
  link,
  stat,
  chmod,
  mkdir,
  utimes,
  mkdtemp,
  symlink,
  readFile,
  realpath,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import type { FileRead } from '@shared/fs'

import { readTextFile } from './text-file'
import { UTF8_BOM, TEXT_FILE_MAX_BYTES } from './text-file.constants'
import { decodeText } from './text-file.utils'
import { settleWrites, writeTextFile } from './text-write'

const versionOf = (read: FileRead): string => (read.kind === 'text' ? read.version : '')

describe('decodeText', () => {
  it('UTF-8 - текст, метка BOM снимается и запоминается', () => {
    expect(decodeText(Buffer.from('привет'))).toEqual({ text: 'привет', bom: false })
    expect(decodeText(Buffer.concat([UTF8_BOM, Buffer.from('a=1')]))).toEqual({
      text: 'a=1',
      bom: true,
    })
  })

  it('ноль в начале и не UTF-8 - не текст', () => {
    expect(decodeText(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))).toBeNull()
    expect(decodeText(Buffer.from([0x63, 0x61, 0x66, 0xe9]))).toBeNull()
  })
})

describe('readTextFile и writeTextFile', () => {
  let base = ''
  let root = ''
  let outside = ''

  beforeAll(async () => {
    // Настоящий путь: /var/folders на маке - ссылка на /private/var/folders.
    base = await realpath(await mkdtemp(join(tmpdir(), 'agentic-workstation-text-')))
    root = join(base, 'project')
    outside = join(base, 'elsewhere')
    await mkdir(join(root, 'src'), { recursive: true })
    await mkdir(outside)
    await writeFile(join(root, 'src', 'app.ts'), 'const a = 1\n')
    await writeFile(join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x00]))
    await writeFile(join(root, 'locked.txt'), 'read only')
    await chmod(join(root, 'locked.txt'), 0o444)
    await writeFile(join(root, 'secret.txt'), 'no read')
    await chmod(join(root, 'secret.txt'), 0o000)
    await writeFile(join(outside, 'zshrc'), 'export A=1\n')
    await symlink(join(outside, 'zshrc'), join(root, 'notes.md'))
    await symlink(join(root, 'src', 'app.ts'), join(root, 'CLAUDE.md'))
    execFileSync('mkfifo', [join(root, 'pipe')])
  })

  afterAll(async () => {
    await chmod(join(root, 'locked.txt'), 0o644)
    await chmod(join(root, 'secret.txt'), 0o644)
    await rm(base, { recursive: true, force: true })
  })

  it('текст с версией; бинарь, папка и пропавший - словами', async () => {
    const read = await readTextFile(root, 'src/app.ts')

    expect(read).toMatchObject({
      kind: 'text',
      text: 'const a = 1\n',
      bom: false,
      readOnly: false,
      outside: false,
      realPath: null,
    })
    expect(versionOf(read)).toMatch(/^\d+:\d+:\d+:12$/)
    expect(await readTextFile(root, 'logo.png')).toEqual({ kind: 'binary' })
    expect(await readTextFile(root, 'src')).toEqual({ kind: 'missing' })
    expect(await readTextFile(root, 'gone.ts')).toEqual({ kind: 'missing' })
    expect(await readTextFile(root, 'locked.txt')).toMatchObject({ readOnly: true })
  })

  it('та же версия, что у окна, - без текста', async () => {
    const read = await readTextFile(root, 'src/app.ts')

    expect(await readTextFile(root, 'src/app.ts', versionOf(read))).toEqual({ kind: 'unchanged' })
  })

  it('нет прав - отказ, а не «файла нет»: вкладка не должна закрыться сама', async () => {
    expect(await readTextFile(root, 'secret.txt')).toEqual({ kind: 'failed', reason: 'denied' })
  })

  it('канал FIFO не вешает чтение', async () => {
    expect(await readTextFile(root, 'pipe')).toEqual({ kind: 'failed', reason: 'unknown' })
  })

  it('ссылка: за проект - outside, внутри - настоящий путь для слежения', async () => {
    expect(await readTextFile(root, 'notes.md')).toMatchObject({ outside: true, realPath: null })
    expect(await readTextFile(root, 'CLAUDE.md')).toMatchObject({
      outside: false,
      realPath: 'src/app.ts',
    })
  })

  it('больше предела не читается', async () => {
    await writeFile(join(root, 'huge.log'), Buffer.alloc(TEXT_FILE_MAX_BYTES + 1, 0x61))

    expect(await readTextFile(root, 'huge.log')).toEqual({
      kind: 'tooLarge',
      size: TEXT_FILE_MAX_BYTES + 1,
      limit: TEXT_FILE_MAX_BYTES,
    })
  })

  it('путь за корень - ошибка, а не чтение', async () => {
    await expect(readTextFile(root, '../outside.txt')).rejects.toThrow()
    await expect(
      writeTextFile(root, '../outside.txt', { text: '', bom: false, expected: null }),
    ).rejects.toThrow()
  })

  it('запись от своей версии проходит, версия - записанного файла', async () => {
    await writeFile(join(root, 'notes.txt'), '# old\n')
    await chmod(join(root, 'notes.txt'), 0o640)
    const before = versionOf(await readTextFile(root, 'notes.txt'))
    const result = await writeTextFile(root, 'notes.txt', {
      text: '# new\n',
      bom: false,
      expected: before,
    })

    expect(result.kind).toBe('saved')
    expect(await readFile(join(root, 'notes.txt'), 'utf8')).toBe('# new\n')
    expect(result.kind === 'saved' && result.version).toBe(
      versionOf(await readTextFile(root, 'notes.txt')),
    )
    // Безопасная запись подменяет файл, но права остаются прежними.
    expect((await stat(join(root, 'notes.txt'))).mode & 0o777).toBe(0o640)
  })

  it('у файла с жёсткими ссылками запись - на месте, ссылки живы', async () => {
    await writeFile(join(root, 'shared-a.txt'), 'one')
    await link(join(root, 'shared-a.txt'), join(root, 'shared-b.txt'))
    await writeTextFile(root, 'shared-a.txt', { text: 'two', bom: false, expected: null })

    expect(await readFile(join(root, 'shared-b.txt'), 'utf8')).toBe('two')
  })

  it('файл поменял кто-то ещё - конфликт, диск не тронут', async () => {
    await writeFile(join(root, 'shared.ts'), 'mine\n')
    const before = versionOf(await readTextFile(root, 'shared.ts'))

    await writeFile(join(root, 'shared.ts'), 'theirs, longer\n')

    expect(
      await writeTextFile(root, 'shared.ts', { text: 'mine 2\n', bom: false, expected: before }),
    ).toEqual({ kind: 'conflict' })
    expect(await readFile(join(root, 'shared.ts'), 'utf8')).toBe('theirs, longer\n')
  })

  it('поменял на тот же текст - не конфликт; поверх - пишет без проверки', async () => {
    await writeFile(join(root, 'same.ts'), 'one\n')
    const before = versionOf(await readTextFile(root, 'same.ts'))

    await writeFile(join(root, 'same.ts'), 'two\n')

    expect(
      await writeTextFile(root, 'same.ts', { text: 'two\n', bom: false, expected: before }),
    ).toMatchObject({ kind: 'saved' })
    expect(
      await writeTextFile(root, 'same.ts', { text: 'three\n', bom: false, expected: null }),
    ).toMatchObject({ kind: 'saved' })
    expect(await readFile(join(root, 'same.ts'), 'utf8')).toBe('three\n')
  })

  it('файл тронули, а текст прежний, - не конфликт; поменяли текст - конфликт', async () => {
    await writeFile(join(root, 'touched.ts'), 'base\n')
    const read = await readTextFile(root, 'touched.ts')
    const base = read.kind === 'text' ? read.hash : null
    const later = new Date(Date.now() + 5_000)

    await utimes(join(root, 'touched.ts'), later, later)

    expect(
      await writeTextFile(root, 'touched.ts', {
        text: 'base mine\n',
        bom: false,
        expected: versionOf(read),
        base,
      }),
    ).toMatchObject({ kind: 'saved' })

    const again = await readTextFile(root, 'touched.ts')

    await writeFile(join(root, 'touched.ts'), 'theirs\n')

    expect(
      await writeTextFile(root, 'touched.ts', {
        text: 'base mine 2\n',
        bom: false,
        expected: versionOf(again),
        base: again.kind === 'text' ? again.hash : null,
      }),
    ).toEqual({ kind: 'conflict' })
  })

  it('метка BOM возвращается при записи', async () => {
    await writeTextFile(root, 'bom.txt', { text: 'x', bom: true, expected: null })

    expect(await readFile(join(root, 'bom.txt'))).toEqual(
      Buffer.concat([UTF8_BOM, Buffer.from('x')]),
    )
  })

  it('ссылка за проект пишется только по явной просьбе, и ссылкой остаётся', async () => {
    const write = (outsideAllowed: boolean) =>
      writeTextFile(root, 'notes.md', {
        text: 'export A=2\n',
        bom: false,
        expected: null,
        outside: outsideAllowed,
      })

    expect(await write(false)).toEqual({ kind: 'failed', reason: 'outside' })
    expect(await readFile(join(outside, 'zshrc'), 'utf8')).toBe('export A=1\n')
    expect(await write(true)).toMatchObject({ kind: 'saved' })
    expect(await readFile(join(outside, 'zshrc'), 'utf8')).toBe('export A=2\n')
    expect((await realpath(join(root, 'notes.md'))) === join(outside, 'zshrc')).toBe(true)
  })

  it('пропавший файл не создаётся заново молча; без прав - denied', async () => {
    expect(
      await writeTextFile(root, 'deleted.ts', { text: 'x', bom: false, expected: '1:1:1:1' }),
    ).toEqual({ kind: 'missing' })
    expect(
      await writeTextFile(root, 'no-dir/file.ts', { text: 'x', bom: false, expected: null }),
    ).toEqual({ kind: 'missing' })
    await chmod(root, 0o555)

    try {
      expect(
        await writeTextFile(root, 'locked.txt', { text: 'x', bom: false, expected: null }),
      ).toEqual({ kind: 'failed', reason: 'denied' })
    } finally {
      await chmod(root, 0o755)
    }
  })

  it('выход ждёт записи, которые ещё идут', async () => {
    const job = writeTextFile(root, 'late.txt', { text: 'late', bom: false, expected: null })

    await settleWrites()

    expect(await readFile(join(root, 'late.txt'), 'utf8')).toBe('late')
    await job
  })
})
