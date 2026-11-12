import { formatTabReference } from '@agentic-workstation/browser-protocol/tab-reference'

import { BrowserError } from './browser-error'
import type { Page } from './page'
import { readSnapshot } from './page-frames'
import { callOn, exceptionText } from './page-nodes'
import { watchScripted } from './page-scripted'
import { JPEG_QUALITIES, planScreenshot, SHOT_MAX_BASE64 } from './screenshot-plan'
import type { Rect } from './screenshot-plan'

/**
 * Картинка вкладки, которую Chrome не рисует (фон, свёрнутое окно), может не прийти вовсе -
 * дольше этого не ждать, а ответить деревом.
 */
export const SCREENSHOT_TIMEOUT_MS = 15_000

/** Результат выражения длиннее - обрезается: модели нужен смысл, а не мегабайты. */
const EVALUATE_MAX = 20_000

const WAIT_POLL_MS = 250

/** Шапка ответа о вкладке: ссылка, адрес, заголовок. */
export const pageHeader = async (page: Page): Promise<string> => {
  const info = await page.info()
  const reference = formatTabReference({
    profileKey: page.tab.profileKey,
    tabId: page.tab.tabId,
    launch: page.tab.launch || null,
  })

  return [`Tab: ${reference}`, `URL: ${info?.url ?? ''}`, `Title: ${info?.title ?? ''}`].join('\n')
}

/**
 * Дерево доступности текстом со ссылками e12 (во фреймах - f2e7) - они действуют до следующего
 * снимка. Дерево длинной страницы расширение прореживает и обрезает само (ax-prune в
 * расширении): модели нужно начало, а не десятки мегабайт через native messaging.
 */
export const snapshot = async (page: Page): Promise<string> => {
  const result = await readSnapshot(page)

  page.setRefs(result.refs)

  const body = result.text || '(The page has no accessible content yet.)'
  const cut = result.truncated
    ? '\n… The snapshot is cut: scroll or use evaluate to read the rest of the page.'
    : ''

  return `${await pageHeader(page)}\n\n${body}${cut}`
}

type LayoutMetrics = {
  cssVisualViewport?: { pageX: number; pageY: number; clientWidth: number; clientHeight: number }
  cssContentSize?: { width: number; height: number }
}

/** Картинка вкладки: base64, формат и пометка, если страница выше показанного. */
export type Shot = { data: string; mimeType: 'image/png' | 'image/jpeg'; note: string | null }

/**
 * Картинка вкладки в пределах API (screenshot-plan.ts): длинная сторона не больше 2000
 * пикселей с учётом Retina, вся страница - сверху, не выше двух её ширин. PNG тяжелее 4.5 МБ
 * в base64 переснимается в JPEG.
 */
export const screenshot = async (page: Page, fullPage: boolean): Promise<Shot> => {
  const [metrics, ratio] = await Promise.all([
    page.cdp<LayoutMetrics>('Page.getLayoutMetrics'),
    page.cdp<{ result?: { value?: unknown } }>('Runtime.evaluate', {
      expression: 'window.devicePixelRatio',
      returnByValue: true,
    }),
  ])
  const view = metrics.cssVisualViewport
  const viewport: Rect = view
    ? { x: view.pageX, y: view.pageY, width: view.clientWidth, height: view.clientHeight }
    : { x: 0, y: 0, width: 800, height: 600 }
  const plan = planScreenshot(
    {
      viewport,
      content: metrics.cssContentSize ?? viewport,
      devicePixelRatio: typeof ratio.result?.value === 'number' ? ratio.result.value : 1,
    },
    fullPage,
  )
  const capture = (format: 'png' | 'jpeg', quality?: number) =>
    page.cdp<{ data: string }>(
      'Page.captureScreenshot',
      {
        format,
        ...(quality ? { quality } : {}),
        fromSurface: true,
        captureBeyondViewport: plan.captureBeyondViewport,
        clip: plan.clip,
      },
      { timeoutMs: SCREENSHOT_TIMEOUT_MS },
    )
  const note = plan.cut
    ? `The page is ${plan.cut.total} px tall; the picture shows the top ${plan.cut.shown} px. Scroll and take a screenshot of the visible part for the rest.`
    : null
  let { data } = await capture('png')

  if (data.length <= SHOT_MAX_BASE64) return { data, mimeType: 'image/png', note }

  for (const quality of JPEG_QUALITIES) {
    data = (await capture('jpeg', quality)).data

    if (data.length <= SHOT_MAX_BASE64) break
  }

  return { data, mimeType: 'image/jpeg', note }
}

type EvaluateResult = {
  result?: { type?: string; value?: unknown; description?: string }
  exceptionDetails?: { text?: string; exception?: { description?: string } }
}

const valueText = (value: unknown): string => {
  const text = value === undefined ? 'undefined' : JSON.stringify(value, null, 2)

  return text.length > EVALUATE_MAX ? `${text.slice(0, EVALUATE_MAX)}… (cut)` : text
}

/** Ответ выражения: значение JSON и сколько действий на странице сделал сам скрипт. */
export type Evaluated = { text: string; scripted: number }

/**
 * Выражение JS в странице; с элементом - функция `(element) => …`, ей передаётся элемент по
 * ссылке. Промис дожидается. Заодно считается, нажимал ли и вводил ли что-то сам скрипт
 * (page-scripted.ts): так модель узнаёт, что действовала мимо руки.
 */
export const evaluate = async (
  page: Page,
  expression: string,
  ref?: string,
): Promise<Evaluated> => {
  const scripted = await watchScripted(page, ref)

  try {
    return { text: await evaluateText(page, expression, ref), scripted: await scripted() }
  } catch (error) {
    await scripted()

    throw error
  }
}

const evaluateText = async (page: Page, expression: string, ref?: string): Promise<string> => {
  if (ref) {
    const value = await callOn<unknown>(page, ref, `function () { return (${expression})(this) }`)

    return valueText(value)
  }

  const result = await page.cdp<EvaluateResult>('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })

  if (result.exceptionDetails) throw new BrowserError('cdp', exceptionText(result.exceptionDetails))

  return valueText(result.result?.value ?? result.result?.description)
}

/** Страница ушла на другой документ посреди вопроса: ответа нет, но это ещё не ошибка. */
const isNavigating = (error: unknown): boolean =>
  error instanceof BrowserError &&
  error.code === 'cdp' &&
  /context was destroyed|cannot find (default )?(execution )?context|inspected target navigated|target closed/i.test(
    error.message,
  )

/**
 * Есть ли текст на странице. Ищет сама страница, а в IDE приходит одно да или нет: весь текст
 * длинной страницы четыре раза в секунду гонять через native messaging незачем. Страница
 * посреди перехода отвечает «ещё нет» (null), а не ошибкой.
 */
const pageHas = async (page: Page, text: string): Promise<boolean | null> => {
  try {
    const result = await page.cdp<EvaluateResult>('Runtime.evaluate', {
      expression: `(() => { const body = document.body; return body ? body.innerText.includes(${JSON.stringify(text)}) : false })()`,
      returnByValue: true,
    })

    return typeof result.result?.value === 'boolean' ? result.result.value : null
  } catch (error) {
    if (isNavigating(error)) return null

    throw error
  }
}

/**
 * Подождать: текст появился, текст пропал или просто время. Опрос по тексту страницы - он
 * работает и в фоновой вкладке, где кадры не рисуются; переход страницы посреди ожидания -
 * не сбой, ждём дальше до срока.
 */
export const waitFor = async (
  page: Page,
  {
    text,
    textGone,
    seconds,
    timeoutMs,
  }: { text?: string; textGone?: string; seconds?: number; timeoutMs: number },
): Promise<string> => {
  if (!text && !textGone) {
    await new Promise((resolve) => setTimeout(resolve, (seconds ?? 1) * 1000))

    return `Waited ${seconds ?? 1} s.`
  }

  const deadline = Date.now() + timeoutMs

  for (;;) {
    if (text && (await pageHas(page, text)) === true) return `"${text}" is on the page.`

    if (textGone && (await pageHas(page, textGone)) === false) {
      return `"${textGone}" is gone from the page.`
    }

    if (Date.now() > deadline) {
      throw new BrowserError(
        'timeout',
        text
          ? `"${text}" did not appear in ${timeoutMs / 1000} s.`
          : `"${textGone}" is still on the page after ${timeoutMs / 1000} s.`,
      )
    }

    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS))
  }
}
