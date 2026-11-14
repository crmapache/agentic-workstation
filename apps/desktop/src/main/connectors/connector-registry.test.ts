import { rm, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { EVERYWHERE } from '@shared/connector-availability'

import { JsonFile } from '../storage/json-file'
import { ConnectorRegistry } from './connector-registry'
import type { StoredConnector, StoredConnectors } from './connector-store'

const connector = (id: string): StoredConnector => ({
  id,
  kind: 'gmail',
  label: id,
  typeId: null,
  description: '',
  serverName: `gmail-${id}`,
  url: null,
  auth: null,
  transport: null,
  command: null,
  spec: null,
  availability: EVERYWHERE,
  inProjects: {},
  account: null,
  enabled: true,
  toolOverrides: {},
  tools: [],
})

describe('ConnectorRegistry', () => {
  let dir = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'registry-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('параллельные правки не портят файл, на диске - последнее состояние', async () => {
    const path = join(dir, 'connectors.json')
    const ids = ['a', 'b', 'c', 'd']
    const registry = new ConnectorRegistry(
      { connectors: ids.map(connector), types: [], googleClientId: null },
      new JsonFile<StoredConnectors>(path),
    )

    await Promise.all(
      ids.map((id) =>
        registry.update(id, { tools: [{ name: `tool-${id}`, description: '', access: 'read' }] }),
      ),
    )

    const saved = JSON.parse(await readFile(path, 'utf8')) as StoredConnectors

    expect(saved.connectors.map((item) => item.tools[0]?.name)).toEqual(
      ids.map((id) => `tool-${id}`),
    )
  })
})
