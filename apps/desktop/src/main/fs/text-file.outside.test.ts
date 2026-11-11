import { execFileSync } from 'node:child_process'
import { rm, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import type { FileRead } from '@shared/fs'

import { opensAsText, readOutsideTextFile } from './text-file'
import { TEXT_FILE_MAX_BYTES } from './text-file.constants'
import { writeOutsideTextFile } from './text-write'

const versionOf = (read: FileRead): string => (read.kind === 'text' ? read.version : '')

describe('файл вне проекта: readOutsideTextFile и writeOutsideTextFile', () => {
  let base = ''

  beforeAll(async () => {
    // Настоящий путь: /var/folders на маке - ссылка на /private/var/folders.
    base = await realpath(await mkdtemp(join(tmpdir(), 'agentic-workstation-outside-')))
    await mkdir(join(base, 'folder'))
    await writeFile(join(base, 'plan.md'), '# план\n')
    await writeFile(join(base, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]))
    execFileSync('mkfifo', [join(base, 'pipe')])
  })

  afterAll(() => rm(base, { recursive: true, force: true }))

  it('текст помечен outside, без настоящего пути; папка и пропавший - нет файла', async () => {
    expect(await readOutsideTextFile(join(base, 'plan.md'))).toMatchObject({
      kind: 'text',
      text: '# план\n',
      outside: true,
      realPath: null,
      readOnly: false,
    })
    expect(await readOutsideTextFile(join(base, 'folder'))).toEqual({ kind: 'missing' })
    expect(await readOutsideTextFile(join(base, 'gone.md'))).toEqual({ kind: 'missing' })
    expect(await readOutsideTextFile(join(base, 'logo.png'))).toEqual({ kind: 'binary' })
    expect(await readOutsideTextFile(join(base, 'pipe'))).toEqual({
      kind: 'failed',
      reason: 'unknown',
    })
  })

  it('негодный путь - ошибка, а не чтение', async () => {
    await expect(readOutsideTextFile('plan.md')).rejects.toThrow()
    await expect(readOutsideTextFile('//host/share/plan.md')).rejects.toThrow()
    await expect(
      writeOutsideTextFile('relative.md', { text: 'x', bom: false, expected: null, outside: true }),
    ).rejects.toThrow()
  })

  it('пишется только по просьбе человека, от своей версии; чужая правка - конфликт', async () => {
    const path = join(base, 'plan.md')
    const read = await readOutsideTextFile(path)
    const write = (outside: boolean, expected: string | null) =>
      writeOutsideTextFile(path, { text: '# новый\n', bom: false, expected, outside })

    expect(await write(false, versionOf(read))).toEqual({ kind: 'failed', reason: 'outside' })
    expect(await readFile(path, 'utf8')).toBe('# план\n')
    expect(await write(true, versionOf(read))).toMatchObject({ kind: 'saved' })
    expect(await readFile(path, 'utf8')).toBe('# новый\n')

    await writeFile(path, '# чужой\n')

    expect(
      await writeOutsideTextFile(path, {
        text: '# мой\n',
        bom: false,
        expected: versionOf(read),
        outside: true,
      }),
    ).toEqual({ kind: 'conflict' })
    expect(await readFile(path, 'utf8')).toBe('# чужой\n')
  })

  it('пропавший файл не создаётся заново молча', async () => {
    expect(
      await writeOutsideTextFile(join(base, 'gone.md'), {
        text: 'x',
        bom: false,
        expected: '1:1:1:1',
        outside: true,
      }),
    ).toEqual({ kind: 'missing' })
  })

  it('opensAsText: текст и пустой - да; бинарь, папка, канал, большой - нет', async () => {
    await writeFile(join(base, 'empty.txt'), '')
    await writeFile(join(base, 'huge.log'), Buffer.alloc(TEXT_FILE_MAX_BYTES + 1, 0x61))

    expect(await opensAsText(join(base, 'plan.md'))).toBe(true)
    expect(await opensAsText(join(base, 'empty.txt'))).toBe(true)
    expect(await opensAsText(join(base, 'logo.png'))).toBe(false)
    expect(await opensAsText(join(base, 'folder'))).toBe(false)
    expect(await opensAsText(join(base, 'pipe'))).toBe(false)
    expect(await opensAsText(join(base, 'huge.log'))).toBe(false)
    expect(await opensAsText(join(base, 'gone.md'))).toBe(false)
  })
})
