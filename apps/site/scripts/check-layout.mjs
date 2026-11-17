/**
 * Осмотр страницы на разных экранах: Chromium и WebKit (движок Safari), от телефона до
 * широкого монитора. Для каждого размера - снимок всей страницы и замеры, которые глаз на снимке
 * пропускает: горизонтальная прокрутка, незагрузившиеся картинки, ошибки в консоли, какая кнопка
 * скачивания стала главной.
 *
 *   pnpm --filter @agentic-workstation/site build && pnpm --filter @agentic-workstation/site preview
 *   pnpm --filter @agentic-workstation/site check:layout [адрес] [папка для снимков]
 *
 * По умолчанию смотрит http://localhost:3026 (preview) и пишет снимки в .screenshots/site в
 * корне репозитория (git её не видит). Код выхода 1, если хоть на одном экране что-то не так.
 */
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { webkit, chromium } from 'playwright-core'

// Функции в page.evaluate исполняются в странице, а не в Node: там эти имена есть.
/* global document, window, getComputedStyle */

const url = process.argv[2] ?? 'http://localhost:3026/'
const outDir =
  process.argv[3] ?? fileURLToPath(new URL('../../../.screenshots/site/', import.meta.url))

const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

/** Экраны: телефоны, планшет, ноутбуки, широкий монитор; у части - другая система посетителя. */
const SCREENS = [
  { name: 'phone-se', width: 320, height: 640, scale: 2, ua: IPHONE_UA, platform: 'mobile' },
  { name: 'phone', width: 390, height: 844, scale: 3, ua: IPHONE_UA, platform: 'mobile' },
  { name: 'tablet', width: 768, height: 1024, scale: 2 },
  { name: 'tablet-wide', width: 1024, height: 768, scale: 2 },
  { name: 'laptop', width: 1280, height: 800, scale: 2 },
  {
    name: 'laptop-windows',
    width: 1366,
    height: 768,
    scale: 1,
    ua: WINDOWS_UA,
    platform: 'windows',
  },
  { name: 'desktop', width: 1440, height: 900, scale: 2 },
  { name: 'wide', width: 1920, height: 1080, scale: 1 },
]

const ENGINES = { chromium, webkit }

await mkdir(outDir, { recursive: true })
let failed = false

for (const [engineName, engine] of Object.entries(ENGINES)) {
  const browser = await engine.launch({ headless: true })

  for (const screen of SCREENS) {
    const context = await browser.newContext({
      viewport: { width: screen.width, height: screen.height },
      deviceScaleFactor: screen.scale,
      ...(screen.ua ? { userAgent: screen.ua } : {}),
      ...(screen.platform === 'mobile' && engineName === 'chromium'
        ? { isMobile: true, hasTouch: true }
        : {}),
    })
    const page = await context.newPage()
    const errors = []
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
    page.on('pageerror', (error) => errors.push(String(error)))

    await page.goto(url, { waitUntil: 'networkidle' })
    // Картинки разделов грузятся лениво: пролистать страницу, чтобы они пришли до снимка.
    // Прокрутка мгновенная: у страницы scroll-behavior: smooth, и плавная не успевала бы
    // дойти до места за шаг - часть картинок так и не начинала грузиться.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo({ top: y, behavior: 'instant' })
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      window.scrollTo({ top: 0, behavior: 'instant' })
    })
    // Ленивая картинка, начавшая грузиться на последнем шаге прокрутки, ещё в пути: ждём все,
    // иначе проверка ловит «битую» картинку, которая через миг пришла бы.
    await page
      .waitForFunction(() => [...document.images].every((image) => image.complete), null, {
        timeout: 15_000,
      })
      .catch(() => {})
    await page.waitForTimeout(800)

    const facts = await page.evaluate(() => {
      const primary = [...document.querySelectorAll('.download')].find(
        (link) => getComputedStyle(link).backgroundColor !== 'rgba(0, 0, 0, 0)',
      )
      return {
        platform: document.documentElement.dataset.platform,
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
        brokenImages: [...document.images]
          .filter((image) => !image.complete || image.naturalWidth === 0)
          .map((image) => image.currentSrc || image.src),
        primaryDownload: primary?.getAttribute('data-os') ?? null,
        version: document.querySelector('[data-release-version]')?.textContent ?? null,
      }
    })

    const problems = [
      ...(facts.overflowX > 0 ? [`horizontal scroll ${facts.overflowX}px`] : []),
      ...facts.brokenImages.map((src) => `broken image ${src}`),
      ...errors.map((error) => `console: ${error}`),
    ]
    failed ||= problems.length > 0

    const file = `${outDir}${engineName}-${screen.name}.png`
    await page.screenshot({ path: file, fullPage: true })
    console.log(
      `${problems.length ? 'FAIL' : 'ok  '} ${engineName} ${screen.name} ${screen.width}x${screen.height}` +
        ` platform=${facts.platform} primary=${facts.primaryDownload} version=${facts.version ?? '-'}`,
    )
    for (const problem of problems) console.log(`     ${problem}`)
    await context.close()
  }

  await browser.close()
}

console.log(`screenshots: ${outDir}`)
process.exit(failed ? 1 : 0)
