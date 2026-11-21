import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach } from 'vitest'

import type { CloudState } from '@shared/tracker'

import type { Cloud } from '@agentic-workstation/cloud/server'
import { createCloud } from '@agentic-workstation/cloud/server'

import { JsonFile } from '../storage/json-file'
import type { VaultCipher } from '../storage/vault'
import { Vault } from '../storage/vault'
import { PLACE, trackerKit } from '../tracker/tracker-test-kit'
import { httpTransport } from './cloud-client'
import type { StoredCloud } from './cloud-service'
import { CloudService } from './cloud-service'

/** Шифр хранилища без связки ключей: в проверке секрет живёт открытым во временной папке. */
const PLAIN: VaultCipher = {
  available: () => true,
  encrypt: (text) => Buffer.from(text),
  decrypt: (data) => data.toString(),
}

const closers: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close()
})

/**
 * Сервер облака: свой во временной папке или боевой, если задан
 * AGENTIC_WORKSTATION_CLOUD_LIVE (каждый прогон заводит там новый пустой аккаунт).
 */
const serverAt = async (): Promise<string> => {
  const live = process.env.AGENTIC_WORKSTATION_CLOUD_LIVE

  if (live) return live

  const dataDir = await mkdtemp(join(tmpdir(), 'aw-cloud-'))
  const cloud: Cloud = createCloud(
    {
      port: 0,
      build: 'test',
      dataDir,
      trustProxy: false,
      readsPerMinute: 10_000,
      writesPerMinute: 10_000,
      accountRequestsPerMinute: 10_000,
      maxBodyBytes: 4 * 1024 * 1024,
      maxAccountRecords: 10_000,
      maxWaitsPerAccount: 8,
      maxWaits: 100,
    },
    () => undefined,
  )
  const port = await cloud.listen(0)

  closers.push(() => cloud.close())

  return `http://127.0.0.1:${port}`
}

/** Компьютер: трекер и облако на своих папках, общий сервер. */
const machine = async (url: string) => {
  const dir = await mkdtemp(join(tmpdir(), 'aw-machine-'))
  const kit = await trackerKit({ remote: 'github.com/me/app' })
  const states: CloudState[] = []
  let clipboard = ''
  const cloud = await CloudService.load({
    vault: await Vault.load(join(dir, 'cloud.vault'), PLAIN),
    file: new JsonFile<StoredCloud>(join(dir, 'cloud.json')),
    book: kit.book,
    transportFor: (account) => httpTransport(url, account),
    onState: (state) => states.push(state),
    writeClipboard: (text) => {
      clipboard = text

      return Promise.resolve()
    },
    sync: { waitSeconds: 2, backoffMs: [50] },
  })

  closers.push(() => kit.service.close())
  closers.push(() => cloud.close())

  return { ...kit, cloud, states, clipboard: () => clipboard }
}

/** Ждать, пока условие станет правдой: синхронизация идёт сама, своим циклом. */
const until = async (check: () => Promise<boolean> | boolean, ms = 8000) => {
  const started = Date.now()

  while (!(await check())) {
    if (Date.now() - started > ms) throw new Error('не дождался')

    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

const titles = async (kit: Awaited<ReturnType<typeof machine>>) =>
  (await kit.service.board(PLACE)).projects.map((project) => project.title).sort()

describe('облако на настоящем сервере', () => {
  it('второй компьютер с тем же ключом видит доску и правки обоих', async () => {
    const url = await serverAt()
    const mac = await machine(url)

    await mac.make({ kind: 'project.create', title: 'С мака' })
    await until(() => mac.cloud.state().status === 'synced')
    expect(mac.cloud.state().keySaved).toBe(false)

    await mac.cloud.copyKey()
    expect(mac.cloud.state().keySaved).toBe(true)

    const windows = await machine(url)

    await windows.make({ kind: 'project.create', title: 'С винды' })
    expect(windows.cloud.state().accountId).not.toBe(mac.cloud.state().accountId)

    const outcome = await windows.cloud.useKey(mac.clipboard())

    expect(outcome.ok).toBe(true)
    expect(windows.cloud.state().accountId).toBe(mac.cloud.state().accountId)

    // Своя доска второго компьютера сливается с облаком первого, долгий забор приносит её первому.
    await until(async () => (await titles(windows)).length === 2)
    await until(async () => (await titles(mac)).length === 2)
    expect(await titles(mac)).toEqual(['С винды', 'С мака'])

    const [first] = (await mac.service.board(PLACE)).projects

    if (!first) throw new Error('нет проекта')

    await mac.apply({ kind: 'project.update', id: first.id, title: 'Переименовал на маке' })
    await until(async () => (await titles(windows)).includes('Переименовал на маке'))
    await until(() => mac.cloud.state().pending === 0 && windows.cloud.state().pending === 0)
  })

  it('чужой текст вместо ключа - отказ, ключ не меняется', async () => {
    const url = await serverAt()
    const mac = await machine(url)
    const before = mac.cloud.state().accountId

    expect(await mac.cloud.useKey('hello')).toEqual({ ok: false, code: 'badKey' })
    expect(mac.cloud.state().accountId).toBe(before)
  })

  it('без сервера - offline, правки ждут и уходят, когда сервер есть', async () => {
    const mac = await machine('http://127.0.0.1:9')

    await mac.make({ kind: 'project.create', title: 'Офлайн' })
    await until(() => mac.cloud.state().status === 'offline')
    expect(mac.cloud.state().pending).toBeGreaterThan(0)

    const off = await mac.cloud.setEnabled(false)

    expect(off.status).toBe('off')
  })
})
