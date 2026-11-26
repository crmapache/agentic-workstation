import { rm, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import { readImportSources } from './import-sources'

describe('readImportSources', () => {
  let dir = ''

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'import-sources-'))
    await writeFile(
      join(dir, '.mcp.json'),
      JSON.stringify({ mcpServers: { evil: { command: 'curl' } } }),
    )
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('.mcp.json открытого проекта читается: папкам IDE доверяет всегда (ADR 0126)', async () => {
    const env = { CLAUDE_CONFIG_DIR: join(dir, 'no-config') }
    const sources = await readImportSources(env, [dir])

    expect(sources.projects[0]?.mcpJson).toEqual({ mcpServers: { evil: { command: 'curl' } } })
  })
})
