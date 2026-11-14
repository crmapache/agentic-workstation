import { rm, chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach } from 'vitest'

import {
  profileNames,
  findProfilePlace,
  findChromeProfile,
  listChromeProfiles,
} from './chrome-profiles'

const EXTENSION = 'mdlbfahcfjmnkgbmpfjdppaljimjmknc'

const dirs: string[] = []

/** Папка данных Chromium: Local State и хранилище расширения в профилях. */
const chromeData = async (
  cache: Record<string, unknown>,
  stores: Record<string, Record<string, string>>,
): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'chrome-data-'))

  dirs.push(dir)
  await writeFile(join(dir, 'Local State'), JSON.stringify({ profile: { info_cache: cache } }))

  for (const [profile, files] of Object.entries(stores)) {
    const store = join(dir, profile, 'Local Extension Settings', EXTENSION)

    await mkdir(store, { recursive: true })

    for (const [file, body] of Object.entries(files)) await writeFile(join(store, file), body)
  }

  return dir
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('профиль Chrome копии расширения', () => {
  it('имя - своё, а у имени по умолчанию - имя аккаунта Google', () => {
    const names = profileNames({
      profile: {
        info_cache: {
          Default: { name: 'Your Chrome', is_using_default_name: true, gaia_given_name: 'Max' },
          'Profile 5': { name: 'Improving', is_using_default_name: false },
          'Profile 7': { name: 'Person 2', is_using_default_name: true },
          broken: 'x',
        },
      },
    })

    expect([...names]).toEqual([
      ['Default', 'Max'],
      ['Profile 5', 'Improving'],
      ['Profile 7', 'Person 2'],
    ])
    expect(profileNames(null).size).toBe(0)
  })

  it('по ключу в хранилище профиля, в журнале или в таблице; чужого ключа нет - null', async () => {
    const chrome = await chromeData(
      {
        Default: { name: 'Max' },
        'Profile 5': { name: 'Improving' },
        'Profile 6': { name: 'Support' },
      },
      {
        Default: { '000003.log': 'profileKey "sz94332b"' },
        'Profile 5': { '000004.ldb': '\u0000\u0001profileKey\u0000"kwt3fu85"', LOCK: 'kwt3fu85' },
        'Profile 6': { '000003.log': 'launchMarker "q7w2e9"' },
      },
    )
    const brave = await chromeData({ Default: { name: 'Home' } }, {})

    const found = (name: string | null) => ({ name, denied: false })

    await expect(findChromeProfile([brave, chrome], EXTENSION, 'kwt3fu85')).resolves.toEqual(
      found('Improving'),
    )
    await expect(findChromeProfile([chrome], EXTENSION, 'sz94332b')).resolves.toEqual(found('Max'))
    await expect(findChromeProfile([chrome], EXTENSION, 'zzzz9999')).resolves.toEqual(found(null))
    // Браузера нет - не «не пустили»: окно не должно просить доступ зря.
    await expect(findChromeProfile([join(chrome, 'gone')], EXTENSION, 'kwt3fu85')).resolves.toEqual(
      found(null),
    )
  })

  it('система не пустила в папку браузера - denied: окно попросит полный доступ к диску', async () => {
    const chrome = await chromeData({ Default: { name: 'Max' } }, {})

    await chmod(join(chrome, 'Local State'), 0o000)

    try {
      await expect(findChromeProfile([chrome], EXTENSION, 'kwt3fu85')).resolves.toEqual({
        name: null,
        denied: true,
      })
    } finally {
      await chmod(join(chrome, 'Local State'), 0o600)
    }
  })

  it('все профили браузера и в каких стоит расширение', async () => {
    const chrome = await chromeData(
      { Default: { name: 'Max' }, 'Profile 4': { name: 'Claude Work' } },
      {},
    )
    const settings = { extensions: { settings: { [EXTENSION]: { location: 4 } } } }

    await mkdir(join(chrome, 'Default'), { recursive: true })
    await writeFile(join(chrome, 'Default', 'Secure Preferences'), JSON.stringify(settings))

    await expect(listChromeProfiles([chrome, join(chrome, 'gone')], EXTENSION)).resolves.toEqual([
      { name: 'Max', hasExtension: true },
      { name: 'Claude Work', hasExtension: false },
    ])
  })

  it('папка профиля по имени, как его видит человек, - чтобы открыть его окно', async () => {
    const chrome = await chromeData(
      { Default: { name: 'Max' }, 'Profile 5': { name: 'Improving' } },
      {},
    )
    const settings = { extensions: { settings: { [EXTENSION]: {} } } }

    await mkdir(join(chrome, 'Profile 5'), { recursive: true })
    await writeFile(join(chrome, 'Profile 5', 'Preferences'), JSON.stringify(settings))

    await expect(findProfilePlace([chrome], EXTENSION, ' improving ')).resolves.toEqual({
      dataDir: chrome,
      dir: 'Profile 5',
      hasExtension: true,
    })
    await expect(findProfilePlace([chrome], EXTENSION, 'Max')).resolves.toMatchObject({
      dir: 'Default',
      hasExtension: false,
    })
    await expect(findProfilePlace([chrome], EXTENSION, 'Work')).resolves.toBeNull()
  })
})
