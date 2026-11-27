import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { it, expect, afterAll, describe } from 'vitest'

import { macWindows, macWitness } from './cg-scene'
import type { Rect } from './computer-geometry'
import { sceneOf, stackAt, isSameStack } from './screen-scene'

const isMac = process.platform === 'darwin'
const withWindow = isMac && process.env['AGENTIC_WORKSTATION_COMPUTER_E2E'] === '1'

// Настоящий оконный сервер через koffi, только чтение: ловит типы, которые koffi отдаёт на
// самом деле, и что список окон читается без «Универсального доступа».
describe.skipIf(!isMac)('mac screen witness, read side', () => {
  it('reads the windows on the screen, top first, with whole numbers and sizes', () => {
    const rows = macWindows()

    expect(rows.length).toBeGreaterThan(0)

    for (const row of rows) {
      expect(Number.isInteger(row.id) && Number.isInteger(row.pid)).toBe(true)
      expect(Number.isFinite(row.bounds.width) && Number.isFinite(row.bounds.x)).toBe(true)
      expect(typeof row.isOrdinary).toBe('boolean')
    }
  })

  it('reads how long ago the last input was', () => {
    const idle = macWitness.idleMs()

    expect(idle).not.toBeNull()
    expect(idle).toBeGreaterThanOrEqual(0)
  })
})

type Fixture = { pid: number; opened: Rect; hidden: Rect }

const centerOf = ({ x, y, width, height }: Rect) => ({ x: x + width / 2, y: y + height / 2 })

/**
 * Окно, открытое поверх точки после «снимка», - то, ради чего сверка (ADR 0129). Окно мелькнёт на
 * экране, поэтому только по переменной:
 *
 *   AGENTIC_WORKSTATION_COMPUTER_E2E=1 pnpm --filter @agentic-workstation/desktop exec vitest run src/main/computer/cg-scene.integration.test.ts
 *
 * Ни мыши, ни клавиатуры тест не трогает.
 */
describe.skipIf(!withWindow)('mac screen witness on a real window', () => {
  let child: ChildProcess | null = null

  afterAll(async () => {
    if (!child || child.exitCode !== null) return

    const exited = new Promise((resolve) => child?.once('exit', resolve))

    child.kill()
    await exited
  })

  const openFixture = () => {
    const electron = createRequire(import.meta.url)('electron') as unknown as string

    child = spawn(electron, [join(import.meta.dirname, '__fixtures__/scene-window.cjs')], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    return new Promise<Fixture>((resolve, reject) => {
      let out = ''

      child?.stdout?.on('data', (chunk: Buffer) => {
        out += chunk.toString()

        const line = out.split('\n').find((item) => item.startsWith('{'))

        if (line) resolve(JSON.parse(line) as Fixture)
      })
      child?.on('exit', () => reject(new Error('The test window exited early')))
    })
  }

  it('sees a window opened over the point, and not the own window hidden from capture', async () => {
    const point = { x: 220, y: 270 }
    const before = stackAt(sceneOf(macWindows(), process.pid), point)
    const fixture = await openFixture()
    const rows = macWindows()
    const after = stackAt(sceneOf(rows, process.pid), point)
    const opened = rows.find(
      (row) => row.pid === fixture.pid && row.bounds.width === fixture.opened.width,
    )
    const hidden = rows.find(
      (row) => row.pid === fixture.pid && row.bounds.width === fixture.hidden.width,
    )

    expect(isSameStack(before, after)).toBe(false)
    expect(opened).toMatchObject({ isOrdinary: true, isCaptured: true, bounds: fixture.opened })
    expect(after.at(-1)?.id).toBe(opened?.id)

    // Своё окно, закрытое от захвата, - как капсула: в сцене процесса-владельца его нет.
    expect(hidden).toMatchObject({ isOrdinary: false, isCaptured: false })
    expect(sceneOf(rows, fixture.pid).some((window) => window.id === hidden?.id)).toBe(false)
    expect(stackAt(sceneOf(rows, fixture.pid), centerOf(fixture.hidden))).not.toContainEqual(
      expect.objectContaining({ id: hidden?.id }),
    )
  }, 30_000)
})
