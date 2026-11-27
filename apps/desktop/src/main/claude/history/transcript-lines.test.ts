import { rm, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { LINE_CHUNK_BYTES } from './history.constants'
import { forEachLine, readLinesFrom } from './transcript-lines'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'aw-transcript-lines-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const fileWith = async (text: string) => {
  const file = join(dir, 'session.jsonl')

  await writeFile(file, text)

  return file
}

const collect = async (read: (onLine: (line: string) => void) => Promise<number>) => {
  const lines: string[] = []
  const end = await read((line) => lines.push(line))

  return { lines, end }
}

describe('построчное чтение транскрипта', () => {
  it('строка длиннее куска и буква на стыке кусков приходят целыми', async () => {
    // Двухбайтная «ж» встаёт ровно на границу куска: декодер по кускам разорвал бы её.
    const long = `${'a'.repeat(LINE_CHUNK_BYTES - 1)}ж${'b'.repeat(LINE_CHUNK_BYTES)}`
    const file = await fileWith(`first\n${long}\nпоследняя\n`)
    const { lines } = await collect((onLine) => forEachLine(file, onLine))

    expect(lines).toEqual(['first', long, 'последняя'])
  })

  it('дочитывание не отдаёт недописанную строку и говорит, где остановилось', async () => {
    const file = await fileWith('one\ntwo\nhal')
    const { lines, end } = await collect((onLine) => readLinesFrom(file, 0, onLine))

    expect(lines).toEqual(['one', 'two'])
    expect(end).toBe('one\ntwo\n'.length)
    expect((await collect((onLine) => readLinesFrom(file, end, onLine))).lines).toEqual([])
  })

  it('чтение целиком отдаёт и хвост без перевода строки', async () => {
    const file = await fileWith('one\ntwo\nhal')

    expect((await collect((onLine) => forEachLine(file, onLine))).lines).toEqual([
      'one',
      'two',
      'hal',
    ])
  })
})
