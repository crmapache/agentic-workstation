import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import { macElementAt } from './ax-element'
import { macInput } from './cg-events'
import { ComputerError } from './computer-error'
import { ComputerHand } from './computer-hand'
import type { Point, InputDriver } from './computer.types'

const isMac = process.platform === 'darwin'
const withWindow = isMac && process.env['AGENTIC_WORKSTATION_COMPUTER_E2E'] === '1'

// Настоящая доступность macOS через koffi, только чтение: ловит типы, которые koffi отдаёт на
// самом деле, и то, что поиск не бросает, даже если разрешения нет.
describe.skipIf(!isMac)('mac element lookup, read side', () => {
  it('answers with an element or a reason for the point under the pointer', () => {
    const lookup = macElementAt(macInput.cursor())

    if (lookup.element) {
      expect(typeof lookup.element.role).toBe('string')
      expect(typeof lookup.element.isActionable).toBe('boolean')
    } else {
      expect(lookup.reason).toMatch(/\w/)
    }
  })
})

type Points = { aceptar: Point; rechazar: Point; text: Point }

/**
 * Своё окно Electron с полосой «Aceptar | Rechazar» и прозрачным для кликов окном над «Aceptar»
 * (ADR 0119). Окно мелькнёт на экране, поэтому только по переменной:
 *
 *   AGENTIC_WORKSTATION_COMPUTER_E2E=1 pnpm --filter @agentic-workstation/desktop exec vitest run src/main/computer/ax-element.integration.test.ts
 *
 * Мышь в руке - подделка, которая только записывает нажатия: настоящих кликов тест не шлёт, а
 * что под точкой - спрашивает у настоящей доступности.
 */
describe.skipIf(!withWindow)('mac element lookup on a real window', () => {
  let child: ChildProcess | null = null
  let points: Points

  beforeAll(async () => {
    const electron = createRequire(import.meta.url)('electron') as unknown as string

    child = spawn(electron, [join(import.meta.dirname, '__fixtures__/ax-window.cjs')], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    points = await new Promise<Points>((resolve, reject) => {
      let out = ''

      child?.stdout?.on('data', (chunk: Buffer) => {
        out += chunk.toString()

        const line = out.split('\n').find((item) => item.startsWith('{'))

        if (line) resolve(JSON.parse(line) as Points)
      })
      child?.on('exit', () => reject(new Error('The test window exited early')))
    })
  }, 30_000)

  // Окно гаснет вместе с тестом, и тест ждёт, пока оно правда закроется.
  afterAll(async () => {
    if (!child || child.exitCode !== null) return

    const exited = new Promise((resolve) => child?.once('exit', resolve))

    child.kill()
    await exited
  })

  /** Рука с мышью-подделкой: нажатия записываются, курсор ходит, поиск элемента - настоящий. */
  const fakeHand = () => {
    const presses: Point[] = []
    let at: Point = { x: 0, y: 0 }
    const input: InputDriver = {
      cursor: () => at,
      mouse: (motion, point) => {
        at = point
        if (motion === 'down') presses.push(point)
      },
      key: () => undefined,
      text: () => undefined,
      typing: { chunk: 20, holdMs: 0, gapMs: 0 },
      scroll: () => undefined,
      heldFlags: () => 0,
      isButtonHeld: () => false,
      elementAt: macElementAt,
    }
    const hand = new ComputerHand(input, {
      random: () => 0.5,
      now: () => 0,
      sleep: () => Promise.resolve(),
    })

    return { hand, presses }
  }

  const AREA = { x: -10_000, y: -10_000, width: 20_000, height: 20_000 }
  const click = (hand: ComputerHand, at: Point, expect?: string) =>
    hand.click(
      at,
      AREA,
      { button: 'left', count: 1, modifiers: [], ...(expect ? { expect } : {}) },
      new AbortController().signal,
    )

  it('finds the button under a click-through window, as the click would', () => {
    expect(macElementAt(points.aceptar)).toEqual({
      element: { role: 'button', name: 'Aceptar', app: 'Electron', isActionable: true },
    })
    expect(macElementAt(points.text).element).toMatchObject({ isActionable: false })
  })

  it('does not press when expect misses, nor a button without expect', async () => {
    const { hand, presses } = fakeHand()

    const missed = await click(hand, points.rechazar, 'Aceptar').catch((error: unknown) => error)

    expect(missed).toBeInstanceOf(ComputerError)
    expect(missed).toMatchObject({ code: 'mismatch' })
    expect((missed as ComputerError).message).toContain(
      'Under the pointer is button "Rechazar" in Electron, not "Aceptar". Nothing was clicked.',
    )
    await expect(click(hand, points.rechazar)).rejects.toMatchObject({ code: 'mismatch' })
    expect(presses).toEqual([])
  })

  it('presses when the label matches and names what it pressed', async () => {
    const { hand, presses } = fakeHand()

    expect(await click(hand, points.aceptar, ' aceptar ')).toEqual({
      element: { role: 'button', name: 'Aceptar', app: 'Electron', isActionable: true },
    })
    expect(presses).toEqual([points.aceptar])
  })
})
