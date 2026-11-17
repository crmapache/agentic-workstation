/**
 * Картинка превью ссылки: снимает scripts/og.html в Chromium Playwright и пишет public/og.png
 * (1200x630 - размер, который ждут Telegram, Slack, X и LinkedIn).
 *
 *   pnpm --filter @agentic-workstation/site og
 *
 * Перезапускать после новых снимков окна (make-shots.sh): превью берёт тот же снимок.
 */
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

const template = fileURLToPath(new URL('./og.html', import.meta.url))
const out = fileURLToPath(new URL('../public/og.png', import.meta.url))

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto(`file://${template}`, { waitUntil: 'load' })
await page.screenshot({ path: out })
await browser.close()
console.log(out)
