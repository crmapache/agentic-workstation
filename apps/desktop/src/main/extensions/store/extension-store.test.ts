import { rm, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { Store } from '@agentic-workstation/store/server'
import { createStore } from '@agentic-workstation/store/server'

import { ExtensionStorage } from '../extension-storage'
import { ExtensionsService } from '../extensions-service'
import type { ExtensionSecrets } from '../extensions-service.types'
import { ExtensionsStore } from '../extensions-store'
import type { StoredExtensions } from '../extensions-store'
import { WindowAsks } from '../window-asks'
import { inlinePort, ExtensionEngine } from '../engine/extension-engine'
import { JsonFile } from '../../storage/json-file'
import { ExtensionStore } from './extension-store'
import { StoreClient } from './store-client'
import { storeKeys } from './store-keys'

/** Одна IDE для проверки: своя папка расширений, свои ключи, свой сервис. */
const ide = async (dir: string, base: string) => {
  const secrets = new Map<string, string>()
  const vault: ExtensionSecrets = {
    get: (key) => secrets.get(key) ?? null,
    set: (key, value) => {
      if (value === null) secrets.delete(key)
      else secrets.set(key, value)

      return Promise.resolve()
    },
    forgetPrefix: () => Promise.resolve(),
  }
  const root = join(dir, 'extensions')
  const store = await ExtensionsStore.load(
    new JsonFile<StoredExtensions>(join(dir, 'extensions.json')),
  )
  const extensions = new ExtensionsService({
    root,
    store,
    storage: new ExtensionStorage(join(dir, 'data')),
    secrets: vault,
    engine: (events) => new ExtensionEngine(inlinePort(), events),
    ide: {
      projects: () => [],
      notify: () => undefined,
      openUrl: () => Promise.resolve(),
      clipboard: { read: () => Promise.resolve(''), write: () => Promise.resolve() },
      workstation: { tools: () => [], call: () => Promise.resolve(null) },
      fetch: () => Promise.resolve({ status: 200, ok: true, headers: {}, body: '' }),
      run: () => Promise.resolve({ code: 0, stdout: '', stderr: '' }),
      trash: async (path) => rm(path, { recursive: true, force: true }),
    },
    asks: new WindowAsks({
      dialog: () => undefined,
      dialogClosed: () => undefined,
      editorAsk: () => undefined,
    }),
    events: {
      changed: () => undefined,
      view: () => undefined,
      logged: () => undefined,
      showView: () => undefined,
      toolsChanged: () => undefined,
    },
  })

  await extensions.start()

  const shop = new ExtensionStore({
    root,
    client: new StoreClient(base, () => storeKeys(vault)),
    extensions,
    store,
    secrets: vault,
  })

  return { root, extensions, shop, store }
}

const write = async (root: string, version: string, permissions: string[] = []) => {
  await mkdir(join(root, 'greeter'), { recursive: true })
  await writeFile(
    join(root, 'greeter', 'extension.json'),
    JSON.stringify({
      id: 'greeter',
      name: 'Greeter',
      version,
      apiVersion: 1,
      description: 'Says hello',
      permissions,
    }),
  )
  await writeFile(
    join(root, 'greeter', 'main.js'),
    `export async function activate(ide) { await ide.commands.register('hi', 'Hi', () => 'hello ${version}') }`,
  )
  await writeFile(join(root, 'greeter', 'README.md'), '# Greeter\n\nSays hello.')
  await writeFile(join(root, 'greeter', 'AGENTS.md'), 'guide for AI - not packed')
}

describe('магазин расширений внутри IDE', () => {
  let dir = ''
  let server: Store
  let base = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ext-store-'))
    server = createStore(
      {
        port: 0,
        dataDir: ':memory:',
        adminToken: '',
        trustProxy: false,
        maxBodyBytes: 3_000_000,
        readsPerMinute: 1000,
        writesPerMinute: 1000,
        publishesPerHour: 100,
      },
      () => undefined,
    )
    base = `http://127.0.0.1:${await server.listen(0)}`
  })

  afterEach(async () => {
    await server.close()
    await rm(dir, { recursive: true, force: true })
  })

  it('автор публикует, другой находит, ставит, запускает, оценивает и получает обновление', async () => {
    const author = await ide(join(dir, 'author'), base)
    const user = await ide(join(dir, 'user'), base)

    await write(author.root, '1.0.0')
    await author.extensions.rescan()

    expect(await author.shop.publish('greeter')).toEqual({ ok: true, value: { version: '1.0.0' } })

    const page = await user.shop.list({ q: 'greet', sort: 'popular', offset: 0 })

    expect(page.ok && page.value.items.map((item) => item.id)).toEqual(['greeter'])

    const installed = await user.shop.install('greeter', null)

    expect(installed.ok).toBe(true)
    await expect(user.extensions.runCommand('greeter.hi')).resolves.toBe('hello 1.0.0')
    await expect(readFile(join(user.root, 'greeter', 'AGENTS.md'), 'utf8')).rejects.toThrow()

    const view = await user.shop.view('greeter')

    expect(view.ok && view.value).toMatchObject({
      installed: { version: '1.0.0', local: false },
      mine: false,
    })
    expect((await user.shop.review('greeter', 5, 'Lovely')).ok).toBe(true)

    // Новая версия просит буфер обмена: обновление встаёт, но ждёт одобрения человека.
    await write(author.root, '1.1.0', ['clipboard'])
    await author.extensions.reload('greeter')
    expect((await author.shop.publish('greeter')).ok).toBe(true)

    const updates = await user.shop.updates()

    expect(updates).toEqual({
      ok: true,
      value: [{ id: 'greeter', installed: '1.0.0', latest: '1.1.0' }],
    })
    expect((await user.shop.install('greeter', null)).ok).toBe(true)
    expect(user.extensions.state().extensions.find((item) => item.id === 'greeter')?.status).toBe(
      'needsApproval',
    )

    const mine = await author.shop.view('greeter')

    expect(mine.ok && mine.value.mine).toBe(true)
    expect(mine.ok && mine.value.listing.rating).toEqual({ average: 5, count: 1 })

    await author.extensions.stop()
    await user.extensions.stop()
  })

  it('своё расширение с тем же id магазин не затирает', async () => {
    const author = await ide(join(dir, 'author'), base)
    const other = await ide(join(dir, 'other'), base)

    await write(author.root, '1.0.0')
    await author.extensions.rescan()
    await author.shop.publish('greeter')
    await write(other.root, '0.1.0')
    await other.extensions.rescan()

    expect(await other.shop.install('greeter', null)).toMatchObject({
      ok: false,
      error: 'exists-local',
    })
    expect(await other.shop.publish('greeter')).toMatchObject({ ok: false, error: 'not-owner' })

    await author.extensions.stop()
    await other.extensions.stop()
  })

  it('без сети - offline, а не исключение', async () => {
    const lonely = await ide(join(dir, 'lonely'), 'http://127.0.0.1:9')

    expect(await lonely.shop.list({ q: '', sort: 'new', offset: 0 })).toMatchObject({
      ok: false,
      error: 'offline',
    })

    await lonely.extensions.stop()
  })
})
