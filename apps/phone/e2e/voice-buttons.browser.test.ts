import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { Page, Browser } from 'playwright-core'
import { chromium } from 'playwright-core'
import { it, vi, expect, afterAll, describe, beforeAll } from 'vitest'

import type { Conversation } from '@shared/conversation'
import { DEFAULT_VOICE_SETTINGS } from '@shared/voice'

import { realTimer } from '../../desktop/src/main/voice/voice-service'
import { CONVERSATION_ID } from '../../desktop/src/main/remote/__fixtures__/fake-ide'
import type { VoicePort } from '../../desktop/src/main/remote/bridge/bridge-ports'
import { VoiceCall } from '../../desktop/src/main/voice/call/voice-call'
import type { VoiceEndpoint } from '../../desktop/src/main/voice/call/voice-endpoint'
import type { ReadRequest } from '../../desktop/src/main/voice/reading/voice-reader'
import type { Harness } from './ide-harness'
import { until, startHarness } from './ide-harness'
import { SHOTS, IPHONE, shotOf, VIEWPORT } from './phone-page'
import { fakeDeepgram } from './voice-deepgram'

/**
 * Кнопки голоса телефона насквозь (ADR 0104, 0106): мобильный Chromium жмёт их, слово `voice`
 * идёт через настоящий релей в IDE. «Stop the agent» обрывает ответ звонка, который звучит, -
 * настоящий звонок IDE, Deepgram - подделка в реальном времени. «Read aloud» у ответа в ленте
 * играет звук, который IDE шлёт кадрами чтения, и останавливается тем же нажатием.
 */

const DIST = join(import.meta.dirname, '..', 'dist')

let ide: Harness

let browser: Browser

let page: Page

let call: VoiceCall | null = null

const deepgram = fakeDeepgram()
/** Отчёты телефона о проигранном: эпоха и миллисекунды. */
const played: Array<{ epoch: number; ms: number }> = []
const readings: ReadRequest[] = []
const stopReading = vi.fn()

/**
 * Звук чтения кусками по 200 мс: первое чтение - секунда и конец, следующие - три секунды без
 * конца (синтез ещё идёт), чтобы стоп застал чтение живым и в IDE.
 */
const readAloud = (request: ReadRequest, whole: boolean) => {
  const chunk = Buffer.alloc(9600)

  for (let index = 0; index < chunk.length / 2; index += 1) {
    chunk.writeInt16LE(Math.round(Math.sin(index / 6) * 3000), index * 2)
  }

  for (let piece = 0; piece < (whole ? 5 : 15); piece += 1) {
    request.sink.audio(new Uint8Array(chunk))
  }

  if (whole) request.sink.end('done')
}

const voice = {
  capability: { available: true },
  start: (endpoint: VoiceEndpoint) => {
    call = new VoiceCall({
      id: 'call1',
      conversationId: CONVERSATION_ID,
      view: { provider: 'claude', origin: 'phone', mode: 'call', startedAt: Date.now() },
      settings: { ...DEFAULT_VOICE_SETTINGS, enabled: true },
      key: 'k',
      dial: deepgram.dial,
      timer: realTimer,
      now: Date.now,
      endpoint,
      agent: { send: () => Promise.resolve(), interrupt: () => undefined, notice: () => undefined },
      checkKey: () => Promise.resolve('ok'),
      onView: () => undefined,
      onEnded: () => {
        call = null
      },
    })
    call.start([])

    return Promise.resolve({ ok: true as const, call: call.view })
  },
  call: (id: string) => {
    if (call?.view.id !== id) return null

    const live = call

    return Object.assign(Object.create(live) as VoiceCall, {
      played: (epoch: number, ms: number) => {
        played.push({ epoch, ms })
        live.played(epoch, ms)
      },
    })
  },
  end: (id: string) => (call?.view.id === id ? call.end('hangup') : undefined),
  read: (request: ReadRequest) => {
    if (call) return 'call'

    readings.push(request)

    const whole = readings.length === 1

    setTimeout(() => readAloud(request, whole), 300)

    return null
  },
  stopReading,
} as unknown as VoicePort

beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true })
  ide = await startHarness({ staticDir: DIST, voice })

  const [project] = ide.ide.workspace.projects

  if (project) ide.ide.workspace.projects[0] = { ...project, home: true }

  browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
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
  call?.end('hangup')
  await browser?.close()
  await ide?.close()
})

describe('кнопки голоса на телефоне', () => {
  it('Stop the agent обрывает ответ, который звучит, и телефон замолкает', async () => {
    await page.goto(ide.pairingUrl())
    await expect
      .poll(() => page.getByRole('button', { name: 'Pair' }).isEnabled(), { timeout: 10_000 })
      .toBe(true)
    await page.getByRole('button', { name: 'Pair' }).click()
    await ide.approve()
    await page.getByRole('button', { name: /Voice call/ }).click()
    await page.getByText('Listening').waitFor()

    const stop = page.getByRole('button', { name: 'Stop the agent' })

    // Звонок только слушает - останавливать нечего, кнопка погашена.
    expect(await stop.isDisabled()).toBe(true)

    const live = await until(() => call, 'the call at the IDE')

    live.conversation({ id: CONVERSATION_ID, status: 'idle', pending: null } as Conversation)
    live.feed({
      conversationId: CONVERSATION_ID,
      upserts: [
        {
          kind: 'assistant',
          id: 'spoken-1',
          parentToolUseId: null,
          text: 'Первая фраза длинного ответа. Вторая фраза ответа. Третья фраза ответа.',
          streaming: false,
        },
      ],
    })
    await page.getByText('Speaking').waitFor()
    await until(() => played.some((report) => report.ms > 800) || null, 'the answer playing')
    await shotOf(page)('voice-04-speaking')

    await stop.tap()

    await page.getByText('Listening').waitFor({ timeout: 3000 })
    await until(() => deepgram.interrupted() || null, 'Interrupt at Deepgram')

    // Телефон замолчал: отчёты о проигранном прежней эпохи больше не растут.
    const before = played.filter((report) => report.epoch === 0).length

    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(played.filter((report) => report.epoch === 0).length).toBeLessThanOrEqual(before + 1)
  })

  it('Read aloud играет ответ из ленты и останавливается вторым нажатием', async () => {
    await page.getByRole('button', { name: 'End call' }).tap()
    await expect.poll(() => page.getByRole('button', { name: 'End call' }).count()).toBe(0)

    await page.getByText('Hi! How can I help?').waitFor()

    // В ленте подделки два ответа: «hello» и этот, второй.
    const button = () => page.getByRole('button', { name: /Read aloud|Stop reading/ }).nth(1)

    await button().tap()
    await until(() => readings[0] ?? null, 'the reading at the IDE')
    expect(readings[0]).toMatchObject({ text: 'Hi! How can I help?' })

    await page.getByRole('button', { name: 'Stop reading' }).waitFor()
    await shotOf(page)('voice-05-reading')
    // Секунда звука дозвучала - кнопка снова «прочитать».
    await page.getByRole('button', { name: 'Stop reading' }).waitFor({ state: 'detached' })

    await button().tap()
    await page.getByRole('button', { name: 'Stop reading' }).waitFor()
    await page.getByRole('button', { name: 'Stop reading' }).tap()
    await until(() => stopReading.mock.calls.length > 0 || null, 'stop at the IDE')
    expect(stopReading).toHaveBeenCalledWith(expect.stringMatching(/^phone:/), readings[1]?.id)
    expect(await page.getByRole('button', { name: 'Stop reading' }).count()).toBe(0)
  })
})
