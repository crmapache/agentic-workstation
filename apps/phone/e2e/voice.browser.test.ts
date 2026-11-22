import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { Browser, Page } from 'playwright-core'
import { chromium } from 'playwright-core'
import { it, expect, afterAll, describe, beforeAll, vi } from 'vitest'

import type { VoiceCallView } from '@shared/voice'

import type { VoicePort } from '../../desktop/src/main/remote/bridge/bridge-ports'
import { CONVERSATION_ID } from '../../desktop/src/main/remote/__fixtures__/fake-ide'
import type { VoiceEndpoint } from '../../desktop/src/main/voice/call/voice-endpoint'
import type { Harness } from './ide-harness'
import { until, startHarness } from './ide-harness'
import { IPHONE, SHOTS, VIEWPORT, shotOf } from './phone-page'

/**
 * Голосовой звонок с телефона (ADR 0104) в мобильном Chromium: собранный клиент раздаёт
 * настоящий релей, микрофон - поддельный Chromium (тон), звонок за IDE - подставной. Строка
 * «Voice call» у машины, разговор звонка с полосой сверху, микрофон доходит до IDE, ответ и
 * состояние - до телефона, «End call» кладёт трубку и полоса уходит. Снимки -
 * .screenshots/phone-voice-*.png.
 */

const DIST = join(import.meta.dirname, '..', 'dist')

const VIEW: VoiceCallView = {
  id: 'call1',
  conversationId: CONVERSATION_ID,
  provider: 'claude',
  origin: 'phone',
  state: 'listening',
  tool: null,
  heard: '',
  muted: false,
  language: null,
  startedAt: 0,
}

let ide: Harness

let browser: Browser

let page: Page

let endpoint: VoiceEndpoint | null = null

const call = {
  mic: vi.fn(),
  played: vi.fn(),
  mute: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  lineLost: vi.fn(),
  lineBack: vi.fn(),
  end: vi.fn(() =>
    endpoint?.cue({ kind: 'ended', reason: 'hangup', conversationId: CONVERSATION_ID }),
  ),
}

const voice = {
  capability: { available: true },
  start: (given: VoiceEndpoint) => {
    endpoint = given
    given.cue({ kind: 'state', call: VIEW })

    return Promise.resolve({ ok: true as const, call: VIEW })
  },
  call: (id: string) => (id === VIEW.id ? call : null),
  end: vi.fn(),
} as unknown as VoicePort

beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true })
  ide = await startHarness({ staticDir: DIST, voice })

  // Разговор звонка живёт в Home: у подделки IDE её проект и есть дом.
  const [project] = ide.ide.workspace.projects

  if (project) ide.ide.workspace.projects[0] = { ...project, home: true }

  browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  })

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE,
    permissions: ['microphone'],
  })

  page = await context.newPage()
})

afterAll(async () => {
  await browser?.close()
  await ide?.close()
})

describe('голосовой звонок с телефона в мобильном Chromium', () => {
  it('строка звонка, полоса над разговором, микрофон до IDE, конец звонка', async () => {
    const shot = shotOf(page)

    await page.goto(ide.pairingUrl())
    await expect
      .poll(() => page.getByRole('button', { name: 'Pair' }).isEnabled(), { timeout: 10_000 })
      .toBe(true)
    await page.getByRole('button', { name: 'Pair' }).click()
    await ide.approve()
    await page.getByRole('heading', { name: 'My IDEs' }).waitFor()

    const row = page.getByRole('button', { name: /Voice call/ })

    await row.waitFor()
    await shot('voice-01-machine')
    await row.click()

    // Звонок поднялся - телефон в разговоре звонка, полоса сверху.
    await page.getByText('Listening').waitFor()
    await until(() => call.mic.mock.calls.length > 3 || null, 'microphone frames at the IDE')

    endpoint?.cue({ kind: 'state', call: { ...VIEW, state: 'speaking', heard: '' } })
    endpoint?.play(Buffer.alloc(24_000), 0, 0)
    await page.getByText('Speaking').waitFor()
    await until(() => call.played.mock.calls.length > 0 || null, 'played report at the IDE')
    endpoint?.cue({
      kind: 'state',
      call: { ...VIEW, state: 'listening', heard: 'Посмотри встречи на завтра' },
    })
    await page.getByText('Посмотри встречи на завтра').waitFor()
    await shot('voice-02-call')

    await page.getByRole('button', { name: 'Mute microphone' }).click()
    await until(() => call.mute.mock.calls.length > 0 || null, 'mute at the IDE')
    expect(call.mute).toHaveBeenCalledWith(true)

    await page.getByRole('button', { name: 'End call' }).click()
    await until(() => call.end.mock.calls.length > 0 || null, 'hang up at the IDE')
    await expect.poll(() => page.getByRole('button', { name: 'End call' }).count()).toBe(0)
    await shot('voice-03-after')
  })
})
