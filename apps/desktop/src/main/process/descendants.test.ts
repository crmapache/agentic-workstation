import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

import { it, expect, describe } from 'vitest'

import { IS_WINDOWS } from '../platform'
import { ProcessGroup } from './process-group'

/** Процесс, который поднимает внука в своей группе (как OpenCode свои команды) и печатает его pid. */
const PARENT = `
const { spawn } = require('node:child_process')
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
process.stdout.write(String(child.pid) + '\\n')
setInterval(() => {}, 1000)
`

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0)

    return true
  } catch {
    return false
  }
}

describe.skipIf(IS_WINDOWS)('потомки в своих группах', () => {
  it('остановка процесса гасит и группы, которые он завёл своим командам', async () => {
    const child = spawn(process.execPath, ['-e', PARENT], { detached: true })
    const group = new ProcessGroup(child, true)
    const grandchild = await new Promise<number>((resolve) => {
      child.stdout.once('data', (chunk: Buffer) => resolve(Number(chunk.toString().trim())))
    })

    expect(isAlive(grandchild)).toBe(true)

    await group.stop()
    await expect.poll(() => isAlive(grandchild), { timeout: 5000 }).toBe(false)
    await delay(10)
  })
})
