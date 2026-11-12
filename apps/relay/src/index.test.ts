import { spawn } from 'node:child_process'
import { join } from 'node:path'

import { it, expect } from 'vitest'

/**
 * Боевой запуск - `node src/index.ts` без сборки (Node 24 снимает типы сам), как в образе.
 * Vitest разрешает импорты по-своему, поэтому релей поднимается здесь настоящим Node: забытое
 * расширение `.ts` в импорте упало бы только на сервере.
 */
it('стартует настоящим Node и гаснет по SIGTERM', async () => {
  const relay = spawn(process.execPath, [join(import.meta.dirname, 'index.ts')], {
    env: { ...process.env, PORT: '0', RELAY_STATIC_DIR: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const port = await new Promise<number>((resolve, reject) => {
    let out = ''

    relay.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString()

      const match = /listening on (\d+)/.exec(out)

      if (match) resolve(Number(match[1]))
    })
    relay.once('exit', (code) => reject(new Error(`relay exited with ${code}: ${out}`)))
  })

  expect(await (await fetch(`http://127.0.0.1:${port}/healthz`)).text()).toBe('ok')

  const exited = new Promise<number | null>((resolve) => relay.once('exit', resolve))

  relay.kill('SIGTERM')
  expect(await exited).toBe(0)
})
