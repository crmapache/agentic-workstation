import { rm, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach } from 'vitest'

import type { IdePrefs } from '@shared/ide-prefs'
import { DEFAULT_IDE_PREFS } from '@shared/ide-prefs'

import { JsonFile } from '../storage/json-file'
import { IdePrefsService } from './ide-prefs-service'

const dirs: string[] = []

const files = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aw-ide-prefs-'))

  dirs.push(dir)

  return {
    dir,
    prefs: new JsonFile<IdePrefs>(join(dir, 'ide-prefs.json')),
    claude: new JsonFile<unknown>(join(dir, 'claude.json')),
  }
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('служба общих настроек IDE', () => {
  it('без своего файла сворачивание вставки переезжает из claude.json и записывается', async () => {
    const { dir, prefs, claude } = await files()

    await writeFile(join(dir, 'claude.json'), JSON.stringify({ prefs: { pasteCollapse: 9 } }))

    const service = await IdePrefsService.load(prefs, claude, () => undefined)

    expect(service.value.pasteCollapse).toBe(9)
    expect(await prefs.read()).toEqual({ ...DEFAULT_IDE_PREFS, pasteCollapse: 9 })
  })

  it('правка ложится поверх нынешних, негодное отбрасывается, окно узнаёт', async () => {
    const { prefs, claude } = await files()
    const seen: IdePrefs[] = []
    const service = await IdePrefsService.load(prefs, claude, (value) => seen.push(value))

    const next = await service.set({
      pasteCollapse: 'много',
      commitAi: [{ provider: 'codex', model: '', effort: 'low' }],
    })

    expect(next).toEqual({
      pasteCollapse: DEFAULT_IDE_PREFS.pasteCollapse,
      commitAi: [{ provider: 'codex', model: '', effort: 'low' }],
    })
    expect(seen).toEqual([next])
    expect(await prefs.read()).toEqual(next)
  })
})
