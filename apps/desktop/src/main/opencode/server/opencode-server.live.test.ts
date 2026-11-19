import { rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import { locateOpenCodeCli } from '../cli/opencode-locator'
import { dataOf, OpenCodeServer } from './opencode-server'

/**
 * Настоящий `opencode serve --stdio` этой машины в своих временных папках: адрес, пароль,
 * версия, поток событий, остановка закрытием stdin. Только по переменной:
 * `AGENTIC_WORKSTATION_OPENCODE_LIVE=1 npx vitest run opencode-server.live`.
 */
describe.skipIf(process.env['AGENTIC_WORKSTATION_OPENCODE_LIVE'] !== '1')(
  'opencode serve вживую',
  () => {
    it('поднимается в своих папках, отвечает с паролем, гаснет закрытием stdin', async () => {
      const cli = await locateOpenCodeCli()
      const dir = await mkdtemp(join(tmpdir(), 'opencode-live-'))
      const exits: (number | null)[] = []

      expect(cli).not.toBeNull()

      const server = new OpenCodeServer(
        {
          binary: cli?.binary ?? '',
          cwd: dir,
          env: cli?.env ?? {},
          dirs: {
            config: join(dir, 'config'),
            data: join(dir, 'data'),
            state: join(dir, 'state'),
            cache: join(dir, 'cache'),
          },
          config: JSON.stringify({ share: 'disabled', update: 'disable' }),
        },
        { onEvent: () => undefined, onExit: (code) => exits.push(code) },
      )
      const info = (await server.request('GET', '/api/info')) as { version?: string }

      console.info('[opencode live] version', info.version, 'cli', cli?.version)
      expect(info.version).toBe(cli?.version)
      expect(dataOf(await server.request('GET', '/api/session'))).toBeDefined()

      await server.stop()
      expect(server.isAlive).toBe(false)
      await rm(dir, { recursive: true, force: true })
    }, 90_000)
  },
)
