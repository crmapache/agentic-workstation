import { rm, utimes, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { countTextLines, FileLineCounter } from './file-line-counter'
import { GIT_LINES_FILE_MAX_BYTES } from './git.constants'

describe('countTextLines', () => {
  it('считает строки, как git: последняя без перевода строки - тоже строка', () => {
    expect(countTextLines(Buffer.from(''))).toBe(0)
    expect(countTextLines(Buffer.from('one\n'))).toBe(1)
    expect(countTextLines(Buffer.from('one\ntwo'))).toBe(2)
    expect(countTextLines(Buffer.from('one\r\ntwo\r\n\n'))).toBe(3)
  })

  it('ноль в начале файла - двоичный', () => {
    expect(countTextLines(Buffer.from([0x89, 0x50, 0x00, 0x0a]))).toBeNull()
  })
})

describe('FileLineCounter', () => {
  let root = ''

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'agentic-workstation-lines-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('складывает строки файлов; двоичный, огромный и пропавший - ноль', async () => {
    await writeFile(join(root, 'a.ts'), 'one\ntwo\n')
    await writeFile(join(root, 'b.ts'), 'three')
    await writeFile(join(root, 'logo.png'), Buffer.from([0x89, 0x00, 0x0a]))
    await writeFile(join(root, 'huge.log'), Buffer.alloc(GIT_LINES_FILE_MAX_BYTES + 1, 0x0a))

    const counter = new FileLineCounter()

    expect(await counter.count(root, ['a.ts', 'b.ts', 'logo.png', 'huge.log', 'gone.ts'])).toBe(3)
  })

  it('ссылка - одна строка, как у git', async () => {
    await writeFile(join(root, 'target.ts'), 'one\ntwo\nthree\n')
    await symlink('target.ts', join(root, 'link.ts'))

    expect(await new FileLineCounter().count(root, ['link.ts'])).toBe(1)
  })

  it('неизменённый файл не перечитывается, изменённый - перечитывается', async () => {
    const path = join(root, 'a.ts')
    const moment = new Date('2026-01-01T00:00:00Z')
    const counter = new FileLineCounter()

    await writeFile(path, 'one\ntwo\n')
    await utimes(path, moment, moment)
    expect(await counter.count(root, ['a.ts'])).toBe(2)

    // Тот же размер и время правки - счёт из памяти, хоть строк на диске и больше.
    await writeFile(path, 'o\nt\nf\nx\n')
    await utimes(path, moment, moment)
    expect(await counter.count(root, ['a.ts'])).toBe(2)

    await utimes(path, new Date(), new Date())
    expect(await counter.count(root, ['a.ts'])).toBe(4)
  })
})
