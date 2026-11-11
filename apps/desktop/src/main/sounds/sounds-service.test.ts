import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { SoundPrefs } from '@shared/sounds'

import { JsonFile } from '../storage/json-file'
import { SoundsService } from './sounds-service'

describe('звуки IDE', () => {
  let dir = ''
  const changes: SoundPrefs[] = []
  const files = () => ({
    own: new JsonFile<SoundPrefs>(join(dir, 'sounds.json')),
    claude: new JsonFile<unknown>(join(dir, 'claude.json')),
  })
  const load = () => {
    const { own, claude } = files()

    return SoundsService.load(own, claude, (prefs) => changes.push(prefs))
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aw-sounds-'))
    changes.length = 0
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('своего файла нет - звуки переезжают из настроек панели Claude Code и пишутся сразу', async () => {
    await files().claude.write({ prefs: { mutedSounds: ['plan'], soundVolumes: { turnDone: 10 } } })

    const sounds = await load()

    expect(sounds.prefs).toEqual({ muted: ['plan'], volumes: { turnDone: 10 } })
    expect(sounds.isMuted('plan')).toBe(true)
    expect(await files().own.read()).toEqual({ muted: ['plan'], volumes: { turnDone: 10 } })
  })

  it('перенос не записался - запуск не падает, звуки из настроек панели в памяти', async () => {
    const { claude } = files()
    const unwritable = new JsonFile<SoundPrefs>(join(dir, 'missing', 'sounds.json'))

    await claude.write({ prefs: { mutedSounds: ['plan'] } })
    unwritable.write = () => Promise.reject(new Error('EACCES'))

    const sounds = await SoundsService.load(unwritable, claude, () => undefined)

    expect(sounds.prefs).toEqual({ muted: ['plan'], volumes: {} })
  })

  it('свой файл главнее старых настроек панели', async () => {
    await files().own.write({ muted: [], volumes: { error: 40 } })
    await files().claude.write({ prefs: { mutedSounds: ['error'] } })

    expect((await load()).prefs).toEqual({ muted: [], volumes: { error: 40 } })
  })

  it('правки подряд пишутся по очереди, на диске - последняя', async () => {
    const sounds = await load()

    await Promise.all([
      sounds.set({ muted: ['plan'], volumes: {} }),
      sounds.set({ muted: ['error'], volumes: {} }),
    ])

    expect(await files().own.read()).toEqual({ muted: ['error'], volumes: {} })
  })

  it('правка из окна разбирается, пишется и уходит окну событием', async () => {
    const sounds = await load()
    const next = await sounds.set({ muted: ['turnDone', 'bogus'], volumes: { question: 250 } })

    expect(next).toEqual({ muted: ['turnDone'], volumes: { question: 100 } })
    expect(changes).toEqual([next])
    expect((await load()).isMuted('turnDone')).toBe(true)
  })
})
