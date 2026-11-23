import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { Page, Browser } from 'playwright-core'
import { chromium } from 'playwright-core'
import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import { PROJECT_PATH, CONVERSATION_ID } from '../../desktop/src/main/remote/__fixtures__/fake-ide'
import type { Harness } from './ide-harness'
import { until, startHarness } from './ide-harness'
import { SHOTS, IPHONE, shotOf, VIEWPORT } from './phone-page'

/**
 * Подсказка «/» на телефоне насквозь: каталог разговора (встроенные CLI, скиллы проекта, найденное
 * на диске) идёт из IDE через настоящий релей, мобильный Chromium набирает «/», выбирает скилл и
 * значение /model касанием. Скилл уходит CLI текстом, /model - выбором разговора, без хода.
 */

const DIST = join(import.meta.dirname, '..', 'dist')

let ide: Harness

let browser: Browser

let page: Page

beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true })
  ide = await startHarness({ staticDir: DIST })

  const { state, claude, models } = {
    state: ide.ide.state,
    claude: ide.ide.claude,
    models: [
      { value: 'opus', displayName: 'Opus 5.5', description: 'Most capable' },
      { value: 'sonnet', displayName: 'Sonnet 5.5', description: 'Fast and smart' },
    ],
  }

  state.models = models
  state.builtinCommands = [
    { name: 'compact', description: 'Free up context', argumentHint: '', builtin: true },
    { name: 'clear', description: 'Start a new session', argumentHint: '', builtin: true },
  ]
  state.commandsByProject = {
    [PROJECT_PATH]: [{ name: 'deploy', description: '', argumentHint: '' }],
  }
  claude.diskCommands = () =>
    Promise.resolve([
      { name: 'deploy', description: 'Ship the current branch to staging', argumentHint: '[env]' },
      {
        name: 'task-review',
        description:
          'Review the branch against the task: every requirement, every edge case, and what the tests prove',
        argumentHint: '',
      },
    ])

  browser = await chromium.launch({ headless: true })

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE,
  })

  page = await context.newPage()
})

afterAll(async () => {
  await browser?.close()
  await ide?.close()
})

const field = () => page.locator('textarea[placeholder="Message"]')

const sentText = () =>
  ide.ide.calls
    .filter((call) => call.name === 'send')
    .map((call) => (call.args[1] as { text: string }).text)

describe('подсказка «/» на телефоне', () => {
  it('скиллы и команды над полем, выбор касанием, /model - выбором разговора', async () => {
    const shot = shotOf(page)

    await page.goto(ide.pairingUrl())
    await expect
      .poll(() => page.getByRole('button', { name: 'Pair' }).isEnabled(), { timeout: 10_000 })
      .toBe(true)
    await page.getByRole('button', { name: 'Pair' }).click()
    await ide.approve()
    await page.getByRole('button', { name: /secret-client/ }).click()
    await page.getByRole('button', { name: /Fix the login bug/ }).click()
    await page.getByText('Hi! How can I help?').waitFor()

    await field().tap()
    await field().fill('/')

    const list = page.getByRole('listbox', { name: 'Commands' })

    await list.waitFor()
    // Свои телефона, встроенные CLI с пояснениями, скилл проекта с описанием с диска.
    await list.getByRole('option', { name: /\/deploy.*Ship the current branch/ }).waitFor()
    await list.getByRole('option', { name: /\/btw/ }).waitFor()
    await list.getByRole('option', { name: /\/compact.*Free up context/ }).waitFor()
    await shot('slash-01-commands')

    // Шапка списка - один ряд: подпись, счёт и крестик по одной средней линии.
    const centers = await page.evaluate(() => {
      const head = document.querySelector('[role="listbox"]')?.previousElementSibling

      return [...(head?.children ?? [])].map((child) => {
        const box = child.getBoundingClientRect()

        return box.top + box.height / 2
      })
    })

    expect(centers).toHaveLength(3)
    for (const center of centers)
      expect(Math.abs(center - (centers[0] ?? 0))).toBeLessThanOrEqual(1)

    await field().fill('/rev')
    // Начинающихся с «rev» нет - содержащие: встроенная code-review и скилл task-review.
    await expect.poll(() => list.getByRole('option').count()).toBe(2)
    await list.getByRole('option', { name: /\/task-review/ }).waitFor()
    await shot('slash-02-narrowed')

    await field().fill('/dep')
    await list.getByRole('option', { name: /\/deploy/ }).tap()
    expect(await field().inputValue()).toBe('/deploy ')
    await expect.poll(() => list.count()).toBe(0)

    await field().pressSequentially('prod')
    await page.getByRole('button', { name: 'Send' }).tap()
    await until(() => sentText().includes('/deploy prod') || null, 'the skill at the IDE')
    await expect.poll(() => field().inputValue()).toBe('')

    // Второй шаг: значения /model; выбор - разговору, а не CLI текстом.
    await field().fill('/mo')
    await list.getByRole('option', { name: /\/model/ }).tap()

    const values = page.getByRole('listbox', { name: 'Values of /model' })

    await values.getByRole('option', { name: /sonnet/ }).waitFor()
    await shot('slash-03-values')
    await values.getByRole('option', { name: /sonnet/ }).tap()
    expect(await field().inputValue()).toBe('/model sonnet')
    await expect.poll(() => values.count()).toBe(0)
    await page.getByRole('button', { name: 'Send' }).tap()
    await until(
      () =>
        ide.ide.calls.find(
          (call) =>
            call.name === 'setOptions' &&
            call.args[0] === CONVERSATION_ID &&
            (call.args[1] as { model?: string }).model === 'sonnet',
        ) ?? null,
      'the model choice at the IDE',
    )
    expect(sentText().some((text) => text.startsWith('/model'))).toBe(false)

    // Крестик закрывает список до следующей буквы.
    await field().fill('/')
    await list.waitFor()
    await page.getByRole('button', { name: 'Close the list' }).tap()
    await expect.poll(() => list.count()).toBe(0)
    await field().pressSequentially('c')
    await list.waitFor()
  })
})
