import { rm, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { JsonFile } from '../storage/json-file'
import { adoptPlaywright, assignCustomTypes } from './connector-migrate'
import { ConnectorRegistry } from './connector-registry'
import { secretsKey, typeSecretsKey } from './connector-secrets'
import { blankConnector, parseStoredConnectors } from './connector-store'
import type { StoredConnectors } from './connector-store'
import type { Vault } from './vault'

/** Хранилище в памяти: шифрование здесь не проверяется, только что куда легло. */
const memoryVault = (entries: Record<string, string>) => {
  const store = new Map(Object.entries(entries))

  return {
    store,
    vault: {
      available: true,
      get: (key: string) => store.get(key) ?? null,
      set: (key: string, value: string | null) => {
        if (value === null) store.delete(key)
        else store.set(key, value)

        return Promise.resolve()
      },
      forgetPrefix: (prefix: string) => {
        for (const key of [...store.keys()]) if (key.startsWith(prefix)) store.delete(key)

        return Promise.resolve()
      },
    } as unknown as Vault,
  }
}

const command = (id: string, serverName: string, args: string[]) => ({
  ...blankConnector({ id, kind: 'command', label: serverName, serverName }),
  command: { command: 'npx', args, cwd: null },
})

describe('assignCustomTypes', () => {
  let dir = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'migrate-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('свои коннекторы получают типы одной записью, встроенные и имена серверов не меняются', async () => {
    const path = join(dir, 'connectors.json')
    const playwright = ['-y', '@playwright/mcp@latest']
    const registry = new ConnectorRegistry(
      {
        connectors: [
          command('a', 'playwright-1', playwright),
          command('b', 'playwright-2', playwright),
          command('c', 'chatkepr', ['/x/index.js']),
          {
            ...blankConnector({ id: 'g', kind: 'gmail', label: 'Main', serverName: 'gmail-main' }),
          },
        ],
        types: [],
        googleClientId: null,
      },
      new JsonFile<StoredConnectors>(path),
    )
    const { vault, store } = memoryVault({
      [secretsKey('c')]: JSON.stringify({ env: { KEY: 'k' }, bearer: 'own' }),
    })
    let next = 0

    await assignCustomTypes(registry, vault, () => `t${++next}`)

    const saved = parseStoredConnectors(JSON.parse(await readFile(path, 'utf8')))

    expect(saved.types.map((type) => [type.id, type.name, type.multiple])).toEqual([
      ['t1', 'Playwright', true],
      ['t2', 'Chatkepr', false],
    ])
    expect(
      saved.connectors.map(({ serverName, typeId, label }) => ({ serverName, typeId, label })),
    ).toEqual([
      { serverName: 'playwright-1', typeId: 't1', label: '1' },
      { serverName: 'playwright-2', typeId: 't1', label: '2' },
      { serverName: 'chatkepr', typeId: 't2', label: '' },
      { serverName: 'gmail-main', typeId: null, label: 'Main' },
    ])
    // Образец типа - то, чем работает коннектор, а не его вход.
    expect(JSON.parse(store.get(typeSecretsKey('t2')) ?? '{}')).toEqual({ env: { KEY: 'k' } })
    expect(store.has(typeSecretsKey('t1'))).toBe(false)

    // Второй запуск ничего не делает: у всех уже есть тип.
    await assignCustomTypes(registry, vault, () => 'again')
    expect(registry.types).toHaveLength(2)
  })

  it('Playwright: свои команды - встроенным Playwright, опустевший свой тип уходит с образцом', async () => {
    const path = join(dir, 'connectors.json')
    const playwright = ['-y', '@playwright/mcp@latest', '--isolated', '--headless']
    const notion = ['-y', '@playwright/mcp@0.0.78', '--user-data-dir', '/u/p', '--headless']
    const typed = (
      id: string,
      serverName: string,
      args: string[],
      typeId: string,
      label: string,
    ) => ({
      ...command(id, serverName, args),
      typeId,
      label,
    })
    const type = (id: string, name: string, serverBase: string) => ({
      id,
      kind: 'command' as const,
      name,
      multiple: id === 'tp',
      serverBase,
      url: null,
      auth: null,
      transport: null,
      command: { command: 'npx', args: playwright, cwd: null },
      spec: null,
    })
    const registry = new ConnectorRegistry(
      {
        connectors: [
          typed('a', 'playwright-1', playwright, 'tp', '1'),
          typed('b', 'playwright-2', playwright, 'tp', '2'),
          typed('c', 'notion-web', notion, 'tn', ''),
          typed('d', 'chatkepr', ['/x/index.js'], 'tc', ''),
        ],
        types: [
          type('tp', 'Playwright', 'playwright'),
          type('tn', 'Notion Web', 'notion-web'),
          type('tc', 'Chatkepr', 'chatkepr'),
        ],
        googleClientId: null,
      },
      new JsonFile<StoredConnectors>(path),
    )
    const { vault, store } = memoryVault({ [typeSecretsKey('tn')]: '{}' })

    await adoptPlaywright(registry, vault)

    const saved = parseStoredConnectors(JSON.parse(await readFile(path, 'utf8')))

    expect(saved.types.map((item) => item.name)).toEqual(['Chatkepr'])
    expect(
      saved.connectors.map(({ kind, serverName, typeId, label }) => [
        kind,
        serverName,
        typeId,
        label,
      ]),
    ).toEqual([
      ['playwright', 'playwright-1', null, '1'],
      ['playwright', 'playwright-2', null, '2'],
      ['playwright', 'notion-web', null, 'Notion Web'],
      ['command', 'chatkepr', 'tc', ''],
    ])
    expect(store.has(typeSecretsKey('tn'))).toBe(false)
  })
})
