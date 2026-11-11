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

  it('.mcp.json недоверенной папки не читается, доверенной - читается', async () => {
    const env = { CLAUDE_CONFIG_DIR: join(dir, 'no-config') }
    const untrusted = await readImportSources(env, [dir], () => Promise.resolve(false))
    const trusted = await readImportSources(env, [dir], () => Promise.resolve(true))

    expect(untrusted.projects[0]?.mcpJson).toBeNull()
    expect(trusted.projects[0]?.mcpJson).toEqual({ mcpServers: { evil: { command: 'curl' } } })
  })
})
