import { rm, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { FileEdit } from './change-revert'
import { revertOnDisk } from './file-revert'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'revert-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true })
})

const EDIT: FileEdit[] = [
  {
    kind: 'patch',
    hunks: [{ oldStart: 1, newStart: 1, lines: [' one', '-two', '+TWO', ' three'] }],
  },
]

describe('откат и возврат файла на диске', () => {
  it('правка снимается, чужая строка в другом месте остаётся, возврат ставит её снова', async () => {
    const path = join(dir, 'a.txt')
    const edit: FileEdit[] = [
      {
        kind: 'patch',
        hunks: [
          { oldStart: 1, newStart: 1, lines: [' a', ' b', ' c', '-two', '+TWO', ' d', ' e', ' f'] },
        ],
      },
    ]

    await writeFile(path, 'a\nb\nc\nTWO\nd\ne\nf\nmine\n')
    await expect(revertOnDisk(path, edit, false)).resolves.toBeNull()
    await expect(readFile(path, 'utf8')).resolves.toBe('a\nb\nc\ntwo\nd\ne\nf\nmine\n')
    // Второй откат того же - засчитан без записи.
    await expect(revertOnDisk(path, edit, false)).resolves.toBeNull()
    await expect(revertOnDisk(path, edit, true)).resolves.toBeNull()
    await expect(readFile(path, 'utf8')).resolves.toBe('a\nb\nc\nTWO\nd\ne\nf\nmine\n')
  })

  it('строки хода переписаны после него - отказ, файл не тронут', async () => {
    const path = join(dir, 'a.txt')

    await writeFile(path, 'one\nTwo by hand\nthree\n')
    await expect(revertOnDisk(path, EDIT, false)).resolves.toBe('changed')
    await expect(readFile(path, 'utf8')).resolves.toBe('one\nTwo by hand\nthree\n')
  })

  it('созданный: откат удаляет, возврат пишет заново с папками; чужой на его месте не трогается', async () => {
    const path = join(dir, 'deep', 'new.txt')
    const created: FileEdit[] = [{ kind: 'create', content: 'fresh\n' }]

    await expect(revertOnDisk(path, created, true)).resolves.toBeNull()
    await expect(readFile(path, 'utf8')).resolves.toBe('fresh\n')
    await expect(revertOnDisk(path, created, false)).resolves.toBeNull()
    await expect(readFile(path)).rejects.toThrow()
    // Уже удалённый созданный - уже откачен.
    await expect(revertOnDisk(path, created, false)).resolves.toBeNull()

    await writeFile(path, 'somebody else\n')
    await expect(revertOnDisk(path, created, true)).resolves.toBe('changed')
    await expect(revertOnDisk(path, created, false)).resolves.toBe('changed')
  })

  it('правленного файла нет - «файла нет»; концы строк Windows остаются', async () => {
    await expect(revertOnDisk(join(dir, 'gone.txt'), EDIT, false)).resolves.toBe('missing')

    const path = join(dir, 'crlf.txt')

    await writeFile(path, 'one\r\nTWO\r\nthree\r\n')
    await expect(revertOnDisk(path, EDIT, false)).resolves.toBeNull()
    await expect(readFile(path, 'utf8')).resolves.toBe('one\r\ntwo\r\nthree\r\n')
  })

  it('не файл - не записался', async () => {
    await expect(revertOnDisk(dir, EDIT, false)).resolves.toBe('failed')
    await expect(revertOnDisk('relative.txt', EDIT, false)).resolves.toBe('failed')
  })
})
