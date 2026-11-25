import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import type { Page, Browser } from 'playwright-core'
import { chromium } from 'playwright-core'
import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import { itemOf } from '../../desktop/src/main/remote/__fixtures__/fake-ide'
import type { ConversationsPort } from '../../desktop/src/main/remote/bridge/bridge-ports'
import type { Harness } from './ide-harness'
import { until, startHarness } from './ide-harness'
import { boxOf, SHOTS, IPHONE, shotOf, VIEWPORT, jpegWithExif } from './phone-page'

/**
 * Копия блоков ответа и «отправить» с фото на телефоне насквозь: ответ с цитатой и кодом приходит
 * из IDE через настоящий релей, касание копии кладёт в буфер текст без разметки. Фото, которое ещё
 * ужимается, и сообщение, которое ещё идёт в IDE, держат «отправить» крутящейся и ненажимаемой.
 */

const DIST = join(import.meta.dirname, '..', 'dist')

const QUOTE_TEXT =
  'Это был второй технический раунд, **лайвкодинг** на `TypeScript`: дали документ RFI и готовый клиент языковой модели, нужно было написать функцию, которая достаёт из ответа типизированную запись.'

const REPLY = [
  'Вот коротко для Димы:',
  '',
  `> ${QUOTE_TEXT}`,
  '>',
  '> Клиент нарочно капризный: отвечает не тем форматом и иногда падает.',
  '',
  'И команда:',
  '',
  '```sh',
  'pnpm --filter @agentic-workstation/phone e2e',
  '```',
].join('\n')

let ide: Harness

let browser: Browser

let page: Page

/** Что сейчас в буфере обмена страницы. */
const clipboard = () => page.evaluate(() => navigator.clipboard.readText())

const sendButton = () => page.getByRole('button', { name: 'Send', exact: true })

beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true })
  ide = await startHarness({ staticDir: DIST })
  browser = await chromium.launch({ headless: true })

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE,
  })

  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ide.pageUrl })
  page = await context.newPage()
})

afterAll(async () => {
  await browser?.close()
  await ide?.close()
})

describe('копия блоков и «отправить» с фото на телефоне', () => {
  it('цитата и код копируются касанием, «отправить» крутится, пока фото готовится и уходит', async () => {
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

    ide.push(itemOf('a-copy', REPLY))

    const quote = page.locator('blockquote')
    const quoteCopy = quote.getByRole('button', { name: 'Copy this block' })

    await quoteCopy.waitFor()
    await quote.scrollIntoViewIfNeeded()

    // Копия - справа вверху, центром на первой строке цитаты; текст под ней идёт во всю ширину.
    const firstLine = await quote
      .locator('p')
      .first()
      .evaluate((paragraph) => {
        const box = paragraph.getBoundingClientRect()
        const line = Number.parseFloat(getComputedStyle(paragraph).lineHeight)

        return { middle: box.top + line / 2, right: box.right }
      })
    const button = await boxOf(page, 'blockquote button')
    const lastLineRight = await quote
      .locator('p')
      .first()
      .evaluate((paragraph) => {
        const range = document.createRange()

        range.selectNodeContents(paragraph)

        return Math.max(...[...range.getClientRects()].map((rect) => rect.right))
      })

    expect(Math.abs(button.middle - firstLine.middle)).toBeLessThanOrEqual(3)
    expect(button.height).toBe(44)
    expect(lastLineRight).toBeGreaterThan(
      (await quoteCopy.evaluate((node) => node.getBoundingClientRect().left)) + 4,
    )
    await shot('copy-01-quote')

    // В буфер - текст цитаты: без «>», без звёздочек и кавычек кода, абзацы на месте.
    await quoteCopy.tap()
    await quote.getByRole('button', { name: 'Copied' }).waitFor()
    expect(await clipboard()).toBe(
      `${QUOTE_TEXT.replace('**лайвкодинг**', 'лайвкодинг').replace('`TypeScript`', 'TypeScript')}\n\nКлиент нарочно капризный: отвечает не тем форматом и иногда падает.`,
    )
    await shot('copy-02-quote-copied')

    // Блок кода: язык и копия - одним рядом в шапке, в буфер - код как есть.
    const code = page.locator('figure')
    const head = await code.locator('figcaption').evaluate((caption) =>
      [...caption.children].map((child) => {
        const box = child.getBoundingClientRect()

        return box.top + box.height / 2
      }),
    )

    expect(head).toHaveLength(2)
    expect(Math.abs((head[0] ?? 0) - (head[1] ?? 0))).toBeLessThanOrEqual(1)
    await code.scrollIntoViewIfNeeded()
    await code.getByRole('button', { name: 'Copy this block' }).tap()
    await code.getByRole('button', { name: 'Copied' }).waitFor()
    expect(await clipboard()).toBe('pnpm --filter @agentic-workstation/phone e2e')
    await shot('copy-03-code-copied')

    // Фото ужимается (здесь - пока тест не отпустит): плитка с крутилкой, «отправить» крутится и
    // не нажимается, хотя текст уже набран, - иначе сообщение ушло бы без фото.
    await page.evaluate(() => {
      const original = window.createImageBitmap.bind(window)
      const gate = new Promise<void>((resolve) => {
        Object.assign(window, { releasePhotos: resolve })
      })

      Object.assign(window, {
        createImageBitmap: (...args: Parameters<typeof createImageBitmap>) =>
          gate.then(() => original(...args)),
      })
    })
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'one.jpg', mimeType: 'image/jpeg', buffer: await jpegWithExif(page) },
      { name: 'two.jpg', mimeType: 'image/jpeg', buffer: await jpegWithExif(page) },
    ])
    await page.getByRole('textbox', { name: 'Message' }).fill('Two photos of the bug')
    await expect
      .poll(() => page.getByRole('img', { name: 'Preparing the attachment' }).count())
      .toBe(2)
    expect(await sendButton().getAttribute('aria-busy')).toBe('true')
    expect(await sendButton().isDisabled()).toBe(true)
    expect(await page.getByRole('button', { name: 'Attach photos or files' }).isDisabled()).toBe(
      true,
    )
    await shot('send-01-preparing')

    await page.evaluate(() => (window as unknown as { releasePhotos: () => void }).releasePhotos())
    await page.getByRole('button', { name: 'Remove photo 2' }).waitFor()
    expect(await sendButton().getAttribute('aria-busy')).toBeNull()
    expect(await sendButton().isEnabled()).toBe(true)

    // Сообщение идёт в IDE (здесь - пока тест не отпустит): «отправить» крутится, второй раз не
    // нажать; ушло - поле и вложения пусты, кнопка снова тихая.
    let release = () => undefined as void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const send = ide.ide.claude.send

    Object.assign(ide.ide.claude, {
      send: (id, message) => gate.then(() => send(id, message)),
    } satisfies Partial<ConversationsPort>)

    await sendButton().tap()
    await expect.poll(() => sendButton().getAttribute('aria-busy')).toBe('true')
    expect(await sendButton().isDisabled()).toBe(true)
    await shot('send-02-sending')

    release()

    const sent = await until(
      () =>
        ide.ide.calls.find(
          (call) =>
            call.name === 'send' && JSON.stringify(call.args).includes('Two photos of the bug'),
        ),
      'the photos at the IDE',
    )

    expect((sent.args[1] as { images: unknown[] }).images).toHaveLength(2)
    await expect.poll(() => page.getByRole('textbox', { name: 'Message' }).inputValue()).toBe('')
    expect(await page.getByRole('button', { name: /Remove photo/ }).count()).toBe(0)
    expect(await sendButton().getAttribute('aria-busy')).toBeNull()
    await shot('send-03-sent')
  })
})
