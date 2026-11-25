import { rm, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import { updateLogLine, appendUpdateLog } from './update-log'

describe('журнал обновления', () => {
  it('строка - местное время и «update:», как у скрипта подмены и сторожа Windows', () => {
    expect(updateLogLine(new Date(2026, 0, 5, 7, 3, 9), '0.2.0: started')).toBe(
      '2026-01-05 07:03:09 update: 0.2.0: started',
    )
  })

  it('дописывает строки и сам заводит папку журналов', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aw-update-log-'))
    const log = join(dir, 'logs', 'update.log')

    try {
      await appendUpdateLog(log, 'one')
      await appendUpdateLog(log, 'two')

      const lines = (await readFile(log, 'utf8')).trim().split(/\r?\n/)

      expect(lines.map((line) => line.replace(/^\S+ \S+ /, ''))).toEqual([
        'update: one',
        'update: two',
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('не бросает, когда записать некуда', async () => {
    await expect(appendUpdateLog('/dev/null/logs/update.log', 'x')).resolves.toBeUndefined()
  })
})
