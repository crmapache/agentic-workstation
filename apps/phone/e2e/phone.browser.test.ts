import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { Page, Browser } from 'playwright-core'
import { chromium } from 'playwright-core'
import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import type { FeedItem } from '@shared/claude-feed'

import { CONVERSATION_ID } from '../../desktop/src/main/remote/__fixtures__/fake-ide'
import type { Harness } from './ide-harness'
import { until, startHarness } from './ide-harness'

/**
 * Телефон целиком в мобильном Chromium (390x844, касание): собранный клиент раздаёт настоящий
 * релей, по ту сторону - настоящий RemoteService с подделками сервисов IDE. Пара → Approve →
 * проекты → разговор → сообщение → живая заплатка → разрешение → запуск сценария → «остановить
 * после текущего» → прогон. Снимки каждого экрана - в .screenshots/phone-*.png.
 */

const DIST = join(import.meta.dirname, '..', 'dist')

const SHOTS = join(import.meta.dirname, '..', '..', '..', '.screenshots')

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

const richFeed: FeedItem[] = [
  {
    id: 't1',
    kind: 'thinking',
    text: 'The login form posts to the wrong endpoint.',
    streaming: false,
    tokens: 220,
    parentToolUseId: null,
  },
  {
    id: 'tool-1',
    kind: 'tool',
    name: 'Bash',
    input: { command: 'pnpm test -- login', description: 'Run the login tests' },
    status: 'done',
    result: { text: '12 passed, 1 failed', isError: false, truncated: false },
    startedAt: 1,
    endedAt: 2,
    closedReason: null,
    parentToolUseId: null,
  },
  {
    id: 'tool-2',
    kind: 'tool',
    name: 'Edit',
    input: { file_path: '/Users/someone/Projects/secret-client/src/auth/login.ts' },
    status: 'done',
    result: {
      text: 'ok',
      isError: false,
      truncated: false,
      changeCounts: { added: 4, removed: 2 },
    },
    startedAt: 2,
    endedAt: 3,
    closedReason: null,
    parentToolUseId: null,
  },
  {
    id: 'a-rich',
    kind: 'assistant',
    text: 'Fixed the endpoint in `login.ts`:\n\n```ts\nconst url = `${api}/v2/login`\n```\n\n- tests pass\n- **no** other changes',
    streaming: false,
    parentToolUseId: null,
  },
  {
    id: 'turn-1',
    kind: 'turn',
    durationMs: 81_000,
    costUsd: 0.12,
    isError: false,
    interrupted: false,
    changes: [
      {
        path: '/x/login.ts',
        added: 4,
        removed: 2,
        created: false,
        counted: true,
        undoable: true,
        reverted: false,
        refusal: null,
      },
    ],
    revertable: true,
    parentToolUseId: null,
  },
]

let ide: Harness

let browser: Browser

let page: Page

const errors: string[] = []

const shot = async (name: string) => {
  await page.waitForTimeout(150)
  await page.screenshot({ path: join(SHOTS, `phone-${name}.png`) })
}

/** Центр по вертикали - для сверки рядов (поле и кнопки, заголовок и кнопки шапки). */
const middle = async (selector: string, parent = false) =>
  page
    .locator(selector)
    .first()
    .evaluate((element, up) => {
      const box = ((up ? element.parentElement : element) ?? element).getBoundingClientRect()

      return { middle: box.top + box.height / 2, height: box.height }
    }, parent)

beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true })
  ide = await startHarness({ staticDir: DIST })
  browser = await chromium.launch({ headless: true })

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE,
  })

  page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
})

afterAll(async () => {
  await browser?.close()
  await ide?.close()
})

describe('телефон в мобильном Chromium против настоящей IDE', () => {
  it('пара, проекты, разговор, разрешение, сценарий, остановка после текущего', async () => {
    // Пара: код из QR, фрагмент стёрт из адреса, отпечатки на экране.
    await page.goto(ide.pairingUrl())
    expect(page.url()).toBe(`${ide.pageUrl}/pair`)
    await page.getByRole('button', { name: 'Pair' }).waitFor()
    await expect
      .poll(() => page.getByRole('button', { name: 'Pair' }).isEnabled(), { timeout: 10_000 })
      .toBe(true)
    await shot('01-pairing')

    const phoneKey = await page.locator('code').nth(1).textContent()

    await page.getByRole('button', { name: 'Pair' }).click()
    await page.getByText('Approve this phone in the IDE').waitFor()
    await shot('02-pairing-waiting')

    const pending = await ide.approve()

    expect(pending.fingerprint).toBe(phoneKey)
    expect(pending.label).toBe('iPhone')

    // Машины и проекты.
    await page.getByRole('heading', { name: 'My IDEs' }).waitFor()
    await page.getByRole('button', { name: /secret-client/ }).waitFor()
    await page.getByText('Online').waitFor()
    await shot('03-machines')

    // Проект: разговоры и очереди.
    await page.getByRole('button', { name: /secret-client/ }).click()
    await page.getByRole('button', { name: /Fix the login bug/ }).waitFor()
    await page.getByRole('button', { name: /Cleanup/ }).waitFor()
    await shot('04-project')

    // Разговор: снимок ленты, сообщение, живая заплатка.
    await page.getByRole('button', { name: /Fix the login bug/ }).click()
    await page.getByText('Hi! How can I help?').waitFor()
    await page.getByRole('textbox', { name: 'Message' }).fill('Run the tests please')
    await page.getByRole('button', { name: 'Send' }).click()
    await until(
      () =>
        ide.ide.calls.some(
          (call) =>
            call.name === 'send' && JSON.stringify(call.args).includes('Run the tests please'),
        ),
      'message at the IDE',
    )
    await page.getByText('Run the tests please').waitFor()
    ide.push(...richFeed)
    ide.service.feedPatched({
      conversationId: CONVERSATION_ID,
      upserts: [],
      tasks: [
        { id: '1', subject: 'Find the bug', activeForm: 'Finding the bug', state: 'completed' },
        {
          id: '2',
          subject: 'Fix the endpoint',
          activeForm: 'Fixing the endpoint',
          state: 'in_progress',
        },
        { id: '3', subject: 'Run the tests', activeForm: 'Running the tests', state: 'pending' },
      ],
    })
    await page.getByText('Fixed the endpoint in').waitFor()
    await page.getByText('+4', { exact: true }).waitFor()

    const field = await middle('textarea')
    const send = await middle('button[aria-label="Send"]')

    expect(Math.abs(field.middle - send.middle)).toBeLessThanOrEqual(1)
    expect(field.height).toBe(send.height)
    await page.getByText('Tasks 1 of 3').waitFor()

    // Шапка: «назад», заголовок и кнопки справа - по одной линии.
    const back = await middle('header button[aria-label="Back"]')
    const titles = await middle('header h1', true)
    const settings = await middle('header button[aria-label="Conversation settings"]')

    expect(Math.abs(back.middle - settings.middle)).toBeLessThanOrEqual(1)
    expect(back.height).toBe(44)
    expect(Math.abs(titles.middle - back.middle)).toBeLessThanOrEqual(1)
    await shot('05-conversation')

    // Разрешение: «один раз», без «всегда».
    ide.ask()
    await page.getByText('Allow Bash?').waitFor()
    expect(await page.getByRole('button', { name: /always/i }).count()).toBe(0)
    await shot('06-permission')
    await page.getByRole('button', { name: 'Allow once' }).click()
    await until(
      () => ide.ide.calls.find((call) => call.name === 'respond'),
      'permission answer at the IDE',
    )
    expect(ide.ide.calls.find((call) => call.name === 'respond')?.args).toEqual([
      CONVERSATION_ID,
      'perm-1',
      { kind: 'permission', decision: { behavior: 'allow' } },
    ])
    await page.getByText('Allow Bash?').waitFor({ state: 'detached' })

    // Настройки разговора: модель и усилие.
    await page.getByRole('button', { name: 'Conversation settings' }).click()
    await page.getByRole('radio', { name: /Sonnet 5/ }).click()
    await until(
      () => ide.ide.calls.find((call) => call.name === 'setOptions'),
      'model change at the IDE',
    )
    await shot('07-conversation-settings')
    await page.getByRole('button', { name: 'Close' }).click()

    // Новый разговор: только разрешённые режимы.
    await page.getByRole('button', { name: 'Back' }).click()
    await page.getByRole('button', { name: 'New conversation' }).first().click()
    await page.getByRole('radio', { name: /Plan first/ }).waitFor()
    expect(
      await page
        .getByRole('radiogroup', { name: 'Mode', exact: true })
        .getByRole('radio')
        .allTextContents(),
    ).toEqual([
      expect.stringContaining('Ask before changes'),
      expect.stringContaining('Accept edits'),
      expect.stringContaining('Plan first'),
    ])
    await shot('08-new-conversation')
    await page.getByRole('button', { name: 'Back' }).click()

    // Запуск сценария в новой очереди.
    await page.getByRole('button', { name: 'Start a scenario' }).click()
    await page.getByRole('radio', { name: 'Tidy up' }).click()
    await page.getByRole('textbox', { name: /What/ }).fill('src/auth')
    await shot('09-start-scenario')
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await until(
      () => ide.ide.calls.find((call) => call.name === 'scenarios.start'),
      'scenario start at the IDE',
    )
    expect(ide.ide.calls.find((call) => call.name === 'scenarios.start')?.args[0]).toMatchObject({
      scenarioId: 'tidy',
      inputs: { what: 'src/auth' },
      target: { kind: 'new', worktree: true },
    })
    await page.getByRole('heading', { name: 'Tidy src' }).waitFor()
    await shot('10-queue-new')

    // Очередь с идущим прогоном: «остановить после текущего».
    await page.getByRole('button', { name: 'Back' }).click()
    await page.getByRole('button', { name: /Cleanup/ }).click()
    await page.getByRole('button', { name: 'Stop after this' }).click()
    await until(
      () =>
        ide.ide.calls.find(
          (call) =>
            call.name === 'scenarios.act' &&
            JSON.stringify(call.args) ===
              JSON.stringify(['q1', { kind: 'stopAfter', itemId: 'i1' }]),
        ),
      'stop after current at the IDE',
    )
    await page.getByText('Stops here').waitFor()
    await shot('11-queue-stop-after')

    // Прогон: вопрос головы.
    await page.getByRole('button', { name: 'Open the run' }).first().click()
    await page.getByText('Delete old files?').waitFor()
    await shot('12-run')

    expect(errors).toEqual([])
  })
})
