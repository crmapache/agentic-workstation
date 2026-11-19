import { rm, lstat, mkdir, mkdtemp, readlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { JsonFile } from '../../storage/json-file'
import type { StoredCodexAccounts } from './codex-accounts'
import { CodexAccounts } from './codex-accounts'

let dir = ''
let saved: StoredCodexAccounts | null = null

const fakeFile = (value: unknown) =>
  ({
    read: () => Promise.resolve(value),
    write: (next: StoredCodexAccounts) => {
      saved = next

      return Promise.resolve()
    },
  }) as unknown as JsonFile<StoredCodexAccounts>

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'codex-accounts-'))
  saved = null
  await mkdir(join(dir, 'home', 'skills'), { recursive: true })
  await writeFile(join(dir, 'home', 'config.toml'), 'model = "x"\n')
  await writeFile(join(dir, 'home', 'auth.json'), '{"secret":1}')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('аккаунты Codex', () => {
  it('добавленный - своя папка входа, общее - ссылками, ключи из окружения пустые', async () => {
    const accounts = await CodexAccounts.load(fakeFile(null), join(dir, 'acc'))
    const id = await accounts.create()
    const shared = join(dir, 'home')
    const env = await accounts.envFor(id, {
      PATH: '/bin',
      OPENAI_API_KEY: 'sk-x',
      CODEX_HOME: shared,
    })
    const home = join(dir, 'acc', id)

    expect(env).toMatchObject({
      CODEX_HOME: home,
      CODEX_SQLITE_HOME: shared,
      OPENAI_API_KEY: '',
      PATH: '/bin',
    })
    expect(await readlink(join(home, 'config.toml'))).toBe(join(dir, 'home', 'config.toml'))
    expect((await lstat(join(home, 'skills'))).isSymbolicLink()).toBe(true)
    await expect(lstat(join(home, 'auth.json'))).rejects.toThrow()
    expect(await accounts.envFor('', { PATH: '/bin' })).toEqual({ PATH: '/bin' })
  })

  it('вошёл - в список и в работу; забыть - папка уходит, разговоры - на обычный вход', async () => {
    const accounts = await CodexAccounts.load(fakeFile(null), join(dir, 'acc'))
    const id = await accounts.create()

    accounts.remember(id, { email: 'b@x', plan: 'plus' })
    accounts.select(id)
    expect(saved).toMatchObject({ current: id, accounts: [{ id: '' }, { id, email: 'b@x' }] })

    await accounts.forget(id)
    expect(accounts.current).toBe('')
    await expect(lstat(join(dir, 'acc', id))).rejects.toThrow()
  })

  it('с диска - только узнаваемое: обычный вход всегда есть, текущий - из списка', async () => {
    const accounts = await CodexAccounts.load(
      fakeFile({
        current: 'zzz',
        accounts: [{ id: 'bad' }, { id: '0123456789abcdef', alias: 'Work' }],
      }),
      join(dir, 'acc'),
    )

    expect(accounts.current).toBe('')
    expect(accounts.list.map((row) => row.id)).toEqual(['', '0123456789abcdef'])
  })
})
