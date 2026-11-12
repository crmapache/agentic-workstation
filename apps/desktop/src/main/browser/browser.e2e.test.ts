import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rm, mkdir, mkdtemp, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

import { it, expect, afterAll, describe, beforeAll } from 'vitest'

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import { EXTENSION_ID } from '@agentic-workstation/browser-protocol/extension-id'

import type { SourceLaunch } from '../connectors/connector-source'
import { buildNativeHost } from '../../../native-host.vite'
import type { NativeSource } from '../connectors/kinds/native-tools'
import { createBrowserSource } from '../connectors/kinds/browser/browser-tools'
import type { BrowserAgent } from './browser-agent'
import { BrowserHub } from './browser-hub'
import { installBridge } from './native-host-install'
import { isAccent, decodePng } from './__fixtures__/png-pixels'
import type { Pixels } from './__fixtures__/png-pixels'

/**
 * Сквозная проверка браузера для ИИ (ADR 0040): Chromium из Playwright (фирменный Chrome 137+
 * не принимает --load-extension) без окна, со своей папкой профиля, собранное расширение,
 * настоящий native host, BrowserHub и инструменты коннектора - против локальной страницы. Две
 * IDE разом (dev и установленная) - тоже: у каждой свой host и свой сокет.
 *
 *   pnpm --filter @agentic-workstation/browser-extension build
 *   AGENTIC_WORKSTATION_BROWSER_E2E=1 pnpm --filter @agentic-workstation/desktop exec vitest run src/main/browser/browser.e2e.test.ts
 *
 * Без переменной, без Chromium или без сборки расширения - пропускается (pnpm check его не
 * гоняет: Chromium на полминуты). С AGENTIC_WORKSTATION_BROWSER_E2E_HEADED=1 Chromium - с
 * окном (оно мелькнёт на экране): так проверяется картинка вкладки в свёрнутом окне. Манифесты
 * host пишутся только в папку профиля теста - браузеры человека не трогаются.
 */

const EXTENSION_DIST = join(import.meta.dirname, '../../../../browser-extension/dist')
const ROOT = join(import.meta.dirname, '../../..')

const findChromium = async (): Promise<string | null> => {
  const cache = join(homedir(), 'Library/Caches/ms-playwright')
  const builds = existsSync(cache)
    ? (await readdir(cache)).filter((name) => /^chromium-\d+$/.test(name)).sort()
    : []

  for (const build of builds.reverse()) {
    const binary = join(
      cache,
      build,
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    )

    if (existsSync(binary)) return binary
  }

  return null
}

const chromium = process.env['AGENTIC_WORKSTATION_BROWSER_E2E'] ? await findChromium() : null
const ready = Boolean(chromium && existsSync(join(EXTENSION_DIST, 'manifest.json')))
const headed = process.env['AGENTIC_WORKSTATION_BROWSER_E2E_HEADED'] === '1'

const PAGE = `<!doctype html><title>AW e2e</title>
<h1>Hello agent</h1>
<button onclick="document.getElementById('out').textContent = 'Clicked!'">Press me</button>
<p id="out">Not yet</p>
<label>Name <input id="name"></label>
<label>Color <select id="color"><option value="r">Red</option><option value="g">Green</option></select></label>
<label><input type="checkbox" id="agree"> Agree</label>
<label>Visit date <input type="date" id="day"></label>
<label>Visit time <input type="time" id="hour"></label>
<label>Attachment <input type="file" id="file"></label>
<a href="/second">Second page</a>
<script>
  // Что видит сайт: события руки агента - для проверки, что она двигается как человек.
  window.hand = { moves: [], downs: [], ups: [], keys: [], trusted: true }
  const note = (list) => (event) => {
    window.hand.trusted = window.hand.trusted && event.isTrusted
    list.push([event.clientX, event.clientY, event.timeStamp, event.key])
  }
  addEventListener('mousemove', note(window.hand.moves), true)
  addEventListener('mousedown', note(window.hand.downs), true)
  addEventListener('mouseup', note(window.hand.ups), true)
  addEventListener('keydown', note(window.hand.keys), true)
</script>`

const SECOND = '<!doctype html><title>Second</title><h1>Second page</h1><p>Welcome aboard</p>'

/**
 * Где страница увидела нажатие: рука жмёт не в середину кнопки, а рядом, - курсор ищут там,
 * где нажали.
 */
const PRESSED_AT = `<script>addEventListener('mousedown', (event) => { window.pressedAt = [event.clientX, event.clientY] }, true)</script>`

/** Синяя страница с кнопкой в известном месте: по пикселям видно содержимое, курсор и рамку. */
const BLUE = `<!doctype html><title>Blue</title><style>body{margin:0;background:#2050d0;height:100vh}</style>
<button style="position:absolute;left:300px;top:200px;width:120px;height:40px">Go</button>
${PRESSED_AT}`

/** Модальное окно сайта - в верхнем слое документа: курсор агента должен быть над ним. */
const MODAL = `<!doctype html><title>Modal</title><style>body{margin:0;background:#2050d0;height:100vh}
dialog{background:#2050d0;border:0;width:300px;height:200px}::backdrop{background:#2050d0}</style>
<dialog id="d"><button id="inside" style="width:120px;height:40px">Inside</button></dialog>
<script>document.getElementById('d').showModal()</script>
${PRESSED_AT}`

/** Полосы по 1000 CSS-пикселей: по цвету видно, какая часть страницы на картинке. */
const BANDS = ['#d02020', '#20a040', '#2050d0', '#d0d020', '#a020a0', '#20d0d0']
const TALL = `<!doctype html><title>Tall</title><style>body{margin:0}div{height:1000px}</style>
${BANDS.map((color) => `<div style="background:${color}"></div>`).join('')}`

/** Длинная страница: дерево доступности - мегабайты, снимок должен обрезаться, а не падать. */
const BIG = `<!doctype html><title>Big</title>${Array.from(
  { length: 20_000 },
  (_, index) => `<p>Paragraph ${index} with a few words of text in it</p>`,
).join('')}`

/**
 * Документ фрейма: кнопка, поле, список и кнопка наведения - всё, что инструменты делают по
 * ссылке. nested - адрес фрейма внутри него.
 */
const frameDoc = (name: string, nested = '') => `<!doctype html><title>${name} doc</title>
<body style="margin:0;padding:8px">
<button onclick="document.getElementById('out').textContent = 'Pressed ${name}'">Press ${name}</button>
<p id="out">Idle ${name}</p>
<label>Field ${name} <input id="field"></label>
<label>Size ${name} <select id="size"><option value="s">Small</option><option value="l">Large</option></select></label>
<button onmouseover="this.textContent = 'Hovered ${name}'">Hover ${name}</button>
${nested ? `<iframe title="Deep frame" src="${nested}" style="margin:12px 0 0 24px;width:380px;height:150px;border:2px solid #000"></iframe>` : ''}`

/**
 * Страница с фреймами: свой (тот же адрес) - в процессе страницы, с localhost - в своём
 * процессе (127.0.0.1 и localhost - разные сайты), а в нём - фрейм с 127.0.0.1, снова свой
 * процесс относительно родителя. Чужой фрейм - ниже первого экрана: до него надо прокрутить.
 * Рамки и поля у iframe - чтобы место фрейма считалось от содержимого, а не от края.
 */
const framesPage = (cross: string) => `<!doctype html><title>Frames</title><body style="margin:0">
<h1 style="margin:30px">Frames</h1>
<iframe title="Same frame" src="/frame-same" style="margin-left:40px;width:420px;height:200px;border:6px solid #000;padding:9px"></iframe>
<div style="height:900px"></div>
<iframe title="Cross frame" src="${cross}/frame-cross" style="margin-left:15px;width:440px;height:360px;border:3px solid #000;padding:4px"></iframe>`

const PAGES: Record<string, string> = {
  '/second': SECOND,
  '/blue': BLUE,
  '/modal': MODAL,
  '/tall': TALL,
  '/big': BIG,
  '/frame-same': frameDoc('same'),
  '/frame-deep': frameDoc('deep'),
}

const isBlue = ([r = 0, , b = 0]: number[]) => b > 150 && r < 100

const text = (result: CallToolResult): string =>
  result.content.map((item) => (item.type === 'text' ? item.text : `[${item.type}]`)).join('\n')

const json = <T>(result: CallToolResult): T => {
  if (result.isError) throw new Error(text(result))

  return JSON.parse(text(result)) as T
}

/** Строки инструмента tabs: ссылка, заголовок, адрес, пометки. */
const tabsOf = (result: CallToolResult) => {
  if (result.isError) throw new Error(text(result))

  return text(result)
    .split('\n')
    .flatMap((line) => {
      const match = /^- (\S+) "(.*)" (\S+)(.*)$/.exec(line)

      return match
        ? [
            {
              tab: match[1] ?? '',
              title: match[2] ?? '',
              url: match[3] ?? '',
              marks: match[4] ?? '',
            },
          ]
        : []
    })
}

/** Ссылка в строке снимка: e3 или, во фрейме, f2e3. */
const REF = /\[ref=((?:f\d+)?e\d+)\]/

/** Ссылка элемента по началу строки снимка: «- button "Press me"» → e3. */
const refOf = (snapshot: string, line: string): string => {
  const found = snapshot.split('\n').find((item) => item.trim().startsWith(line))
  const ref = REF.exec(found ?? '')?.[1]

  if (!ref) throw new Error(`No "${line}" in snapshot:\n${snapshot}`)

  return ref
}

/** Ссылка элемента по его имени в снимке, какой бы ни была роль (поле даты, поле файла). */
const refByName = (snapshot: string, name: string): string => {
  const found = snapshot
    .split('\n')
    .find((item) => item.includes(`"${name}"`) && item.includes('[ref='))
  const ref = REF.exec(found ?? '')?.[1]

  if (!ref) throw new Error(`No "${name}" in snapshot:\n${snapshot}`)

  return ref
}

const tabIdOf = (reference: string): number => Number(/\/(\d+)/.exec(reference)?.[1])

describe.skipIf(!ready)(
  'браузер для ИИ: Chromium + расширение + host + шлюзовые инструменты',
  () => {
    let dir = ''
    let project = ''
    let socketDir = ''
    let hub: BrowserHub
    let second: BrowserHub
    let source: NativeSource<BrowserAgent>
    let secondSource: NativeSource<BrowserAgent>
    let browser: ChildProcess
    let server: Server
    let crossServer: Server
    let base = ''
    let cross = ''
    let launch: SourceLaunch
    const call = (name: string, args: Record<string, unknown> = {}) =>
      source.callTool(name, args, undefined, launch)
    const newHub = (channel: 'dev' | 'installed') =>
      new BrowserHub({ channel, ideVersion: 'e2e', extensionBuild: () => null })
    const profileKey = () => hub.profiles()[0]?.key ?? ''
    const cdp = (tabId: number, method: string, params: Record<string, unknown> = {}) =>
      hub.request(profileKey(), 'cdp', { tabId, method, params })
    /** Где страница увидела последнее нажатие мыши (PRESSED_AT). */
    const pressedAt = async () =>
      JSON.parse(text(await call('evaluate', { expression: 'window.pressedAt' }))) as [
        number,
        number,
      ]

    beforeAll(async () => {
      dir = await realpath(await mkdtemp(join(tmpdir(), 'aw-e2e-')))
      project = join(dir, 'project')
      socketDir = await mkdtemp('/tmp/aw-')
      await mkdir(project)
      await writeFile(join(project, 'cv.txt'), 'Ada Lovelace')
      await writeFile(join(dir, 'secret.txt'), 'not for sites')
      launch = {
        id: 'launch-e2e',
        projectPath: '/work/e2e-project',
        workDir: project,
        conversationId: null,
      }
      server = createServer((request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html' })
        response.end(
          request.url === '/frames' ? framesPage(cross) : (PAGES[request.url ?? ''] ?? PAGE),
        )
      })
      // Второй сайт для фрейма другого процесса: тот же адрес машины, но под именем localhost.
      crossServer = createServer((_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html' })
        response.end(frameDoc('cross', `${base}/frame-deep`))
      })
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      await new Promise<void>((resolve) => crossServer.listen(0, '127.0.0.1', resolve))
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      cross = `http://localhost:${(crossServer.address() as AddressInfo).port}`

      const profile = join(dir, 'profile')
      const hostJs = await buildNativeHost(ROOT, join(dir, 'host-build'))
      const placesOf = (channel: 'dev' | 'installed') => ({
        channel,
        socketPath: join(socketDir, `${channel}.sock`),
        hostDir: join(dir, `native-host-${channel}`),
        extensionDir: join(dir, 'chrome-extension'),
        legacyExtensionDir: null,
      })

      // Chromium со своей папкой профиля ищет манифесты host в <профиль>/NativeMessagingHosts.
      for (const channel of ['dev', 'installed'] as const) {
        await installBridge(
          { hostJs, extensionDir: EXTENSION_DIST },
          placesOf(channel),
          process.execPath,
          [join(profile, 'NativeMessagingHosts')],
        )
      }

      hub = newHub('dev')
      second = newHub('installed')
      await hub.start(placesOf('dev').socketPath)
      await second.start(placesOf('installed').socketPath)
      source = createBrowserSource(hub)
      secondSource = createBrowserSource(second)
      browser = spawn(
        chromium as string,
        [
          ...(headed ? [] : ['--headless=new']),
          '--remote-debugging-port=0',
          '--window-size=900,700',
          `--user-data-dir=${profile}`,
          `--load-extension=${placesOf('dev').extensionDir}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-component-update',
          'about:blank',
        ],
        { stdio: 'ignore' },
      )

      // Расширение подключается через host само, без окна и без человека, - к обеим IDE.
      for (
        const deadline = Date.now() + 30_000;
        !hub.profiles().length || !second.profiles().length;
      ) {
        if (Date.now() > deadline) throw new Error('The extension did not connect in 30 s')

        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }, 90_000)

    afterAll(async () => {
      await source?.dispose()
      await secondSource?.dispose()
      await stopChromium(browser)
      await hub?.stop()
      await second?.stop()
      await new Promise((resolve) => server?.close(resolve))
      await new Promise((resolve) => crossServer?.close(resolve))
      await rm(dir, { recursive: true, force: true })
      await rm(socketDir, { recursive: true, force: true })
    })

    it('открывает вкладку агента в оранжевой группе, видит, кликает, печатает, снимает, заканчивает', async () => {
      const [profile] = json<{ profile: string; browser: string }[]>(await call('profiles'))

      expect(profile?.browser).toBeTruthy()

      const opened = json<{ tab: string; url: string; title: string }>(
        await call('open', { url: base }),
      )

      // Ссылка несёт метку запуска Chrome: после его перезапуска она уже не возьмёт чужую вкладку.
      expect(opened.tab).toMatch(/^chrome-tab:[a-z0-9]+\/\d+@[a-z0-9]{6}$/)
      expect(opened).toMatchObject({ url: `${base}/`, title: 'AW e2e' })

      const listing = await hub.request(profile?.profile ?? '', 'tabs.list', {})
      const tabId = tabIdOf(opened.tab)
      const agentTab = listing.tabs.find((tab) => tab.tabId === tabId)
      const group = listing.groups.find((item) => item.groupId === agentTab?.groupId)

      expect(agentTab?.active).toBe(false)
      expect(group).toMatchObject({ title: 'AW · e2e-project', color: 'orange' })

      const before = text(await call('snapshot'))

      expect(before).toContain('- heading "Hello agent" [level=1]')
      expect(before).toContain('- paragraph [ref=')
      expect(before).toContain('Not yet')

      const clicked = json<{ url: string }>(
        await call('click', { ref: refOf(before, '- button "Press me"') }),
      )

      expect(clicked.url).toBe(`${base}/`)

      const form = text(await call('snapshot'))

      expect(form).toContain('Clicked!')
      // Курсор агента после клика на странице, но в снимке его нет: он не элемент сайта.
      expect(form).not.toContain('Agentic Workstation')
      expect(form).not.toMatch(/- image \[ref=/)

      json(await call('type', { ref: refOf(form, '- textbox "Name"'), text: 'Ada Lovelace' }))

      // Рука глазами сайта: к кнопке мышь шла путём, а не прыгнула; кнопку держали, а не
      // щёлкнули за ноль; имя набрано по клавише с паузами (ADR 0044).
      const hand = JSON.parse(text(await call('evaluate', { expression: 'window.hand' }))) as {
        moves: [number, number, number][]
        downs: [number, number, number][]
        ups: [number, number, number][]
        keys: [number, number, number, string][]
        trusted: boolean
      }
      const firstDown = hand.downs[0]?.[2] ?? 0
      const approach = hand.moves.filter((move) => move[2] < firstDown)
      const typed = hand.keys.filter((key) => key[3].length === 1)
      const gaps = typed.slice(1).map((key, index) => key[2] - (typed[index]?.[2] ?? 0))

      expect(hand.trusted).toBe(true)
      expect(approach.length).toBeGreaterThan(8)
      expect(new Set(approach.map((move) => `${move[0]},${move[1]}`)).size).toBeGreaterThan(5)
      expect((hand.ups[0]?.[2] ?? 0) - firstDown).toBeGreaterThan(40)
      expect(typed.map((key) => key[3]).join('')).toBe('Ada Lovelace')
      expect(Math.min(...gaps)).toBeGreaterThan(20)
      expect(new Set(gaps.map(Math.round)).size).toBeGreaterThan(3)
      json(await call('select', { ref: refOf(form, '- combobox "Color"'), values: ['Green'] }))
      json(
        await call('fill', { fields: [{ ref: refOf(form, '- checkbox "Agree"'), value: 'true' }] }),
      )

      // Дата и время не печатаются по буквам - значение ставится целиком и проверяется.
      const day = refByName(form, 'Visit date')
      const hour = refByName(form, 'Visit time')

      json(await call('fill', { fields: [{ ref: day, value: '2026-11-10' }] }))
      json(await call('type', { ref: hour, text: '13:45' }))

      const wrongDay = await call('fill', { fields: [{ ref: day, value: '10/11/2026' }] })

      expect(wrongDay.isError).toBe(true)
      expect(text(wrongDay)).toContain('YYYY-MM-DD')

      const values = text(
        await call('evaluate', {
          expression:
            "[document.getElementById('name').value, document.getElementById('color').value, document.getElementById('agree').checked, document.hasFocus(), document.getElementById('day').value, document.getElementById('hour').value]",
        }),
      )

      expect(JSON.parse(values)).toEqual(['Ada Lovelace', 'g', true, true, '', '13:45'])

      // Неверная дата очистила поле - поставить снова и убедиться, что событие change дошло.
      json(await call('fill', { fields: [{ ref: day, value: '2026-11-10' }] }))
      expect(
        JSON.parse(
          text(await call('evaluate', { expression: "document.getElementById('day').value" })),
        ),
      ).toBe('2026-11-10')

      // Загрузка - только файл проекта; файл вне проекта модель не отдаст сайту.
      const file = refByName(form, 'Attachment')
      const outside = await call('upload', { ref: file, files: [join(dir, 'secret.txt')] })

      expect(outside.isError).toBe(true)
      expect(text(outside)).toContain("outside this conversation's project folder")
      json(await call('upload', { ref: file, files: [join(project, 'cv.txt')] }))
      expect(
        JSON.parse(
          text(
            await call('evaluate', { expression: "document.getElementById('file').files[0].name" }),
          ),
        ),
      ).toBe('cv.txt')

      expect(text(await call('wait', { text: 'Clicked!' }))).toContain('is on the page')

      await call('evaluate', { expression: "console.warn('agent says', 7)" })
      expect(text(await call('console'))).toContain('[warn] agent says 7')

      const shot = await call('screenshot')
      const image = shot.content.find((item) => item.type === 'image')

      expect(
        image && 'data' in image ? Buffer.from(image.data, 'base64').subarray(1, 4).toString() : '',
      ).toBe('PNG')

      // Ожидание текста переживает переход страницы посреди опроса.
      await call('evaluate', { expression: "setTimeout(() => { location.href = '/second' }, 300)" })
      expect(text(await call('wait', { text: 'Welcome aboard', timeout: 10 }))).toContain(
        'is on the page',
      )

      // Ссылки снимка прежней страницы после перехода не действуют.
      const stale = await call('click', { ref: refOf(before, '- button "Press me"') })

      expect(stale.isError).toBe(true)
      expect(text(stale)).toContain('Take a new snapshot')

      expect(json<{ url: string }>(await call('back')).url).toBe(`${base}/`)

      const navigated = json<{ url: string; title: string }>(
        await call('navigate', { url: `${base}/second` }),
      )

      expect(navigated).toMatchObject({ url: `${base}/second`, title: 'Second' })

      expect(json(await call('finish'))).toEqual({ closed: 1, released: 0 })

      const after = await hub.request(profile?.profile ?? '', 'tabs.list', {})

      expect(after.tabs.some((tab) => tab.tabId === tabId)).toBe(false)
      expect(after.groups.some((item) => item.groupId === group?.groupId)).toBe(false)
    }, 120_000)

    it('фреймы: снимок видит iframe своего и чужого процесса, клик, ввод и выбор по ссылкам внутри', async () => {
      const opened = json<{ tab: string }>(await call('open', { url: `${base}/frames` }))
      const tabId = tabIdOf(opened.tab)

      // Фрейм с localhost и вложенный в него с 127.0.0.1 - в своих процессах: у отладчика на
      // них свои сессии. Фрейм того же сайта - в процессе страницы, сессии у него нет.
      await expect
        .poll(async () =>
          (await hub.request(profileKey(), 'debugger.frames', { tabId })).frames
            .map((frame) => new URL(frame.url).pathname)
            .sort(),
        )
        .toEqual(['/frame-cross', '/frame-deep'])

      const before = text(await call('snapshot'))

      expect(before).toMatch(/- iframe "Same frame" \[ref=e\d+\] \[frame=f1\]/)
      expect(before).toMatch(/- iframe "Cross frame" \[ref=e\d+\] \[frame=f2\]/)
      expect(before).toMatch(/- iframe "Deep frame" \[ref=f2e\d+\] \[frame=f3\]/)

      for (const [name, frame] of [
        ['same', 'f1'],
        ['cross', 'f2'],
        ['deep', 'f3'],
      ] as const) {
        const button = refOf(before, `- button "Press ${name}"`)

        expect(button).toMatch(new RegExp(`^${frame}e\\d+$`))
        json(await call('click', { ref: button }))
        json(
          await call('type', {
            ref: refOf(before, `- textbox "Field ${name}"`),
            text: `Ada ${name}`,
          }),
        )
      }

      json(
        await call('select', { ref: refOf(before, '- combobox "Size cross"'), values: ['Large'] }),
      )
      json(
        await call('fill', {
          fields: [{ ref: refOf(before, '- textbox "Field deep"'), value: 'Grace' }],
        }),
      )
      json(await call('hover', { ref: refOf(before, '- button "Hover deep"') }))

      // Прокрутка к элементу во фрейме: к фрейму другого процесса - вместе с его iframe, который
      // ниже первого экрана страницы.
      const scrollY = async () =>
        JSON.parse(text(await call('evaluate', { expression: 'window.scrollY' }))) as number

      json(await call('scroll', { ref: refOf(before, '- button "Press same"') }))
      expect(await scrollY()).toBeLessThan(100)
      json(await call('scroll', { ref: refOf(before, '- button "Press deep"') }))
      expect(await scrollY()).toBeGreaterThan(500)

      const after = text(await call('snapshot'))

      for (const done of ['Pressed same', 'Pressed cross', 'Pressed deep', 'Hovered deep']) {
        expect(after).toContain(done)
      }

      // Функция с элементом исполняется в документе его фрейма.
      const valueOf = async (line: string): Promise<unknown> =>
        JSON.parse(
          text(await call('evaluate', { ref: refOf(after, line), expression: '(el) => el.value' })),
        )

      expect(await valueOf('- textbox "Field same"')).toBe('Ada same')
      expect(await valueOf('- textbox "Field cross"')).toBe('Ada cross')
      expect(await valueOf('- textbox "Field deep"')).toBe('Grace')
      expect(await valueOf('- combobox "Size cross"')).toBe('l')

      // Отладчик сняли (минута простоя, вторая IDE): подключение заново ждёт и вложенные фреймы -
      // снимок сразу после него их видит.
      await hub.request(profileKey(), 'debugger.detach', { tabId })

      const again = text(await call('snapshot'))

      expect(again).toMatch(/- iframe "Deep frame" \[ref=f2e\d+\] \[frame=f3\]/)

      // Ссылки снимка переживают отключение: сессии фреймов новые, а id фреймов те же.
      await hub.request(profileKey(), 'debugger.detach', { tabId })
      json(await call('click', { ref: refOf(again, '- textbox "Field deep"') }))
      json(await call('type', { ref: refOf(again, '- textbox "Field deep"'), text: 'Again' }))
      expect(await valueOf('- textbox "Field deep"')).toBe('Again')
      json(await call('finish'))
    }, 120_000)

    it('берёт вкладку человека по ссылке и отпускает её, не закрывая', async () => {
      const human = tabsOf(await call('tabs')).find((tab) => tab.url === 'about:blank')

      expect(human).toBeTruthy()

      const taken = json<{ tab: string }>(await call('take', { tab: `${human?.tab} "Blank"` }))

      expect(taken.tab).toBe(human?.tab)
      json(await call('navigate', { url: `${base}/second` }))
      expect(json(await call('finish'))).toEqual({ closed: 0, released: 1 })

      const still = tabsOf(await call('tabs')).find((tab) => tab.tab === human?.tab)

      expect(still).toMatchObject({ url: `${base}/second` })
      expect(still?.marks).not.toContain('held by')
    }, 60_000)

    it('две IDE в одной вкладке: одна отпустила - у другой отладчик на месте', async () => {
      const human = tabsOf(await call('tabs')).find((tab) => tab.url === `${base}/second`)
      const otherLaunch = { ...launch, id: 'launch-second' }

      json(await call('take', { tab: human?.tab }))
      json(await secondSource.callTool('take', { tab: human?.tab }, undefined, otherLaunch))
      json(await call('finish'))

      // Напрямую, мимо повторного подключения в IDE: отладчик второй IDE не снят.
      const answer = await second.request(second.profiles()[0]?.key ?? '', 'cdp', {
        tabId: tabIdOf(human?.tab ?? ''),
        method: 'Runtime.evaluate',
        params: { expression: '6 * 7', returnByValue: true },
      })

      expect(answer).toMatchObject({ result: { value: 42 } })
      json(await secondSource.callTool('finish', {}, undefined, otherLaunch))
    }, 60_000)

    it('конец процесса без разговора закрывает его вкладки сам', async () => {
      const ending = { ...launch, id: 'launch-end' }
      const opened = json<{ tab: string }>(
        await source.callTool('open', { url: base }, undefined, ending),
      )

      source.release(ending)

      await expect
        .poll(async () => tabsOf(await call('tabs')).some((tab) => tab.tab === opened.tab), {
          timeout: 10_000,
        })
        .toBe(false)
    }, 60_000)

    it('картинка: не больше 2000 по длинной стороне, с места прокрутки, длинная страница режется', async () => {
      const opened = json<{ tab: string }>(await call('open', { url: `${base}/tall` }))
      const tabId = tabIdOf(opened.tab)

      // Экран как у Retina с запасом: видимая часть - 2700 пикселей в ширину.
      await cdp(tabId, 'Emulation.setDeviceMetricsOverride', {
        width: 900,
        height: 700,
        deviceScaleFactor: 3,
        mobile: false,
      })
      json(await call('scroll', { deltaY: 1200 }))
      await call('wait', { seconds: 0.3 })

      const visible = pixelsOf(await call('screenshot'))

      expect(Math.max(visible.width, visible.height)).toBeLessThanOrEqual(2000)
      // Точка (100, 100) окна - 1300 CSS-пикселей страницы: вторая полоса, зелёная. Середину
      // окна не берём - туда прокрутка поставила курсор агента.
      expect(isGreen(pageSpot(visible))).toBe(true)

      const full = await call('screenshot', { fullPage: true })
      const fullPixels = pixelsOf(full)

      expect(Math.max(fullPixels.width, fullPixels.height)).toBeLessThanOrEqual(2000)
      expect(text(full)).toMatch(/is 6000 px tall; the picture shows the top \d+ px/)

      await cdp(tabId, 'Emulation.clearDeviceMetricsOverride')
      json(await call('finish'))
    }, 60_000)

    it('длинная страница: снимок обрезан, а не падает', async () => {
      json(await call('open', { url: `${base}/big` }))

      const snapshot = await call('snapshot')

      expect(snapshot.isError).toBeFalsy()
      expect(text(snapshot)).toContain('Paragraph 0 with a few words')
      expect(text(snapshot)).toContain('The snapshot is cut')
      json(await call('finish'))
    }, 60_000)

    it('картинка фоновой вкладки (и свёрнутого окна - с окном): содержимое, курсор, рамка', async () => {
      json(await call('open', { url: `${base}/blue` }))

      const background = pixelsOf(await call('screenshot'))

      expect(isBlue(pageSpot(background))).toBe(true)

      const snapshot = text(await call('snapshot'))

      json(await call('click', { ref: refOf(snapshot, '- button "Go"') }))

      const pressed = await pressedAt()
      const clicked = pixelsOf(await call('screenshot'))

      // Острие курсора - там, где нажали (рядом с серединой кнопки 360, 220), стрелка уходит
      // вправо-вниз.
      expect(Math.abs(pressed[0] - 360)).toBeLessThanOrEqual(18)
      expect(Math.abs(pressed[1] - 220)).toBeLessThanOrEqual(18)
      expect(accentNear(clicked, pressed[0], pressed[1])).toBeGreaterThan(10)
      expect(isAccent(clicked.at(0, clicked.height >> 1))).toBe(true)

      if (headed) {
        const port = (await readFile(join(dir, 'profile/DevToolsActivePort'), 'utf8')).split(
          '\n',
        )[0]
        const browserCdp = await cdpClient(port ?? '')
        const targets = await browserCdp.send<{
          targetInfos: { targetId: string; type: string }[]
        }>('Target.getTargets')
        const page = targets.targetInfos.find((target) => target.type === 'page')
        const { windowId } = await browserCdp.send<{ windowId: number }>(
          'Browser.getWindowForTarget',
          { targetId: page?.targetId },
        )

        await browserCdp.send('Browser.setWindowBounds', {
          windowId,
          bounds: { windowState: 'minimized' },
        })
        await new Promise((resolve) => setTimeout(resolve, 1500))

        const minimized = pixelsOf(await call('screenshot'))

        expect(isBlue(pageSpot(minimized))).toBe(true)
        json(await call('click', { ref: refOf(snapshot, '- button "Go"') }))
        browserCdp.close()
      }

      json(await call('finish'))
    }, 60_000)

    it('курсор агента - над модальным окном сайта', async () => {
      json(await call('open', { url: `${base}/modal` }))

      const snapshot = text(await call('snapshot'))

      json(await call('click', { ref: refOf(snapshot, '- button "Inside"') }))

      const pressed = await pressedAt()

      expect(
        accentNear(pixelsOf(await call('screenshot')), pressed[0], pressed[1]),
      ).toBeGreaterThan(10)
      json(await call('finish'))
    }, 60_000)

    it('окно расширения: связь, сессия, имя профиля, ссылка на вкладку, Stop', async () => {
      const opened = json<{ tab: string }>(await call('open', { url: base }))
      const tabId = tabIdOf(opened.tab)
      const browserCdp = await cdpClient(await devToolsPort(dir))
      const { targetId } = await browserCdp.send<{ targetId: string }>('Target.createTarget', {
        url: `chrome-extension://${EXTENSION_ID}/popup/popup.html`,
      })
      const { sessionId } = await browserCdp.send<{ sessionId: string }>('Target.attachToTarget', {
        targetId,
        flatten: true,
      })
      const inPopup = async <T>(expression: string): Promise<T> => {
        const { result } = await browserCdp.send<{ result: { value: T } }>(
          'Runtime.evaluate',
          { expression, awaitPromise: true, returnByValue: true },
          sessionId,
        )

        return result.value
      }
      const ask = <T>(message: object) =>
        inPopup<T>(`chrome.runtime.sendMessage(${JSON.stringify(message)})`)

      await new Promise((resolve) => setTimeout(resolve, 500))

      const state = await ask<{
        links: {
          channel: string
          state: string
          sessions: { id: string; title: string; tabIds: number[] }[]
        }[]
      }>({ type: 'popup:state' })
      const dev = state.links.find((link) => link.channel === 'dev')

      expect(dev).toMatchObject({
        state: 'connected',
        sessions: [{ id: launch.id, title: 'AW · e2e-project', tabIds: [tabId] }],
      })

      const shots = process.env['AGENTIC_WORKSTATION_BROWSER_E2E_SHOTS']

      if (shots) {
        // Размер окна значка: страница расширения открыта вкладкой, а не всплывающим окном.
        await browserCdp.send(
          'Emulation.setDeviceMetricsOverride',
          { width: 360, height: 480, deviceScaleFactor: 2, mobile: false },
          sessionId,
        )

        const { data } = await browserCdp.send<{ data: string }>(
          'Page.captureScreenshot',
          { format: 'png' },
          sessionId,
        )

        await writeFile(join(shots, 'browser-popup.png'), Buffer.from(data, 'base64'))
      }

      // Ряды окна ровные по вертикали: значок и заголовок, точка и имя, имя сессии и Stop.
      const offsets = await inPopup<number[]>(`(() => {
        const center = (node) => { const box = node.getBoundingClientRect(); return box.top + box.height / 2 }
        const pairs = [['.headerIcon', '.title'], ['.dot', '.rowName'], ['section:nth-of-type(3) .rowName', 'section:nth-of-type(3) .button']]
        return pairs.map(([a, b]) => Math.abs(center(document.querySelector(a)) - center(document.querySelector(b))))
      })()`)

      expect(Math.max(...offsets)).toBeLessThanOrEqual(1)
      // Имя профиля подписано тем, что оно значит, без абзаца пояснения.
      expect(await inPopup<string>("document.querySelector('label.caps').textContent")).toBe(
        'Name shown to the AI',
      )

      await ask({ type: 'popup:rename', name: '  Work  profile ' })
      await expect.poll(() => hub.profiles()[0]?.name).toBe('Work profile')

      // Ссылка на вкладку - в буфер через offscreen-документ: запись прошла.
      expect(await ask({ type: 'popup:copy', tabId })).toBe(true)

      await ask({ type: 'popup:stop', channel: 'dev', sessionId: launch.id })
      await expect
        .poll(async () =>
          (await hub.request(profileKey(), 'tabs.list', {})).tabs.some(
            (tab) => tab.tabId === tabId,
          ),
        )
        .toBe(false)

      // Первый вызов после Stop - объяснение модели, следующий снова работает.
      const stopped = await call('tabs')

      expect(stopped.isError).toBe(true)
      expect(text(stopped)).toContain('pressed Stop')
      expect((await call('tabs')).isError).toBeFalsy()

      await browserCdp.send('Target.closeTarget', { targetId })
      browserCdp.close()
    }, 60_000)

    it('IDE упала и поднялась без сессий - расширение закрывает её осиротевшие вкладки', async () => {
      const opened = json<{ tab: string }>(await call('open', { url: base }))
      const tabId = tabIdOf(opened.tab)
      const socketPath = join(socketDir, 'dev.sock')

      // Падение: сессии в памяти прежней IDE пропали, вкладку никто не закрывал.
      await hub.stop()
      await new Promise((resolve) => setTimeout(resolve, 300))

      const crashed = source

      hub = newHub('dev')
      source = createBrowserSource(hub)
      await hub.start(socketPath)
      await expect.poll(() => hub.profiles().length, { timeout: 10_000 }).toBe(1)
      await expect
        .poll(
          async () =>
            (await hub.request(profileKey(), 'tabs.list', {})).tabs.some(
              (tab) => tab.tabId === tabId,
            ),
          { timeout: 10_000 },
        )
        .toBe(false)
      await crashed.dispose()
    }, 60_000)
  },
)

const isGreen = ([r = 0, g = 0, b = 0]: number[]) => g > 120 && r < 80 && b < 100

/**
 * Погасить свой Chromium по его PID и дождаться выхода: папку профиля удалять можно только
 * после - иначе он пишет в неё, пока её удаляют. Не вышел за 5 секунд - SIGKILL.
 */
const stopChromium = async (child: ChildProcess | undefined): Promise<void> => {
  if (!child || child.exitCode !== null || child.signalCode !== null) return

  const exited = new Promise((resolve) => child.once('exit', resolve))

  child.kill('SIGTERM')

  const timer = setTimeout(() => child.kill('SIGKILL'), 5000)

  await exited
  clearTimeout(timer)
}

/** Точек акцентного цвета вправо-вниз от острия курсора (x, y в CSS-пикселях окна 900). */
const accentNear = (pixels: Pixels, x: number, y: number): number => {
  const scale = pixels.width / 900
  let count = 0

  for (let dy = 0; dy < 25; dy += 1) {
    for (let dx = 0; dx < 15; dx += 1) {
      if (isAccent(pixels.at(Math.round((x + dx) * scale), Math.round((y + dy) * scale)))) {
        count += 1
      }
    }
  }

  return count
}

/**
 * Точка фона страницы (100, 100 CSS) - вдали от кнопки и курсора: середина кадра попадает на
 * подпись курсора, когда плашка отладчика Chrome укорачивает страницу.
 */
const pageSpot = (pixels: Pixels): number[] => {
  const scale = pixels.width / 900

  return pixels.at(Math.round(100 * scale), Math.round(100 * scale))
}

const pixelsOf = (result: CallToolResult) => {
  const image = result.content.find((item) => item.type === 'image')

  if (!image || !('data' in image)) throw new Error(text(result))

  return decodePng(Buffer.from(image.data, 'base64'))
}

/** CDP всего браузера (не вкладки): свернуть окно, как это сделал бы человек. */
const cdpClient = async (port: string) => {
  const { webSocketDebuggerUrl } = (await (
    await fetch(`http://127.0.0.1:${port}/json/version`)
  ).json()) as { webSocketDebuggerUrl: string }
  const socket = new WebSocket(webSocketDebuggerUrl)
  let id = 0

  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }))

  return {
    send: <T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId?: string) =>
      new Promise<T>((resolve) => {
        const mine = ++id
        const onMessage = (event: MessageEvent) => {
          const message = JSON.parse(String(event.data)) as { id?: number; result?: T }

          if (message.id !== mine) return

          socket.removeEventListener('message', onMessage)
          resolve(message.result as T)
        }

        socket.addEventListener('message', onMessage)
        socket.send(
          JSON.stringify({ id: mine, method, params, ...(sessionId ? { sessionId } : {}) }),
        )
      }),
    close: () => socket.close(),
  }
}

/** Порт отладки всего браузера: Chromium пишет его в папку профиля. */
const devToolsPort = async (dir: string): Promise<string> =>
  (await readFile(join(dir, 'profile/DevToolsActivePort'), 'utf8')).split('\n')[0] ?? ''
