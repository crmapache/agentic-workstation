import { it, expect, describe, afterEach } from 'vitest'

import { BrowserAgent } from './browser-agent'
import { BrowserError } from './browser-error'
import { typeText } from './page-actions'
import { fieldClip } from './page-typing'
import { isMultiline, normalizeBreaks } from './typed-lines'
import { callOf, FakeHub } from './__fixtures__/fake-hub'

const agents: BrowserAgent[] = []

afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.dispose()))
})

type Focused = { kind: string; text: string; length?: number }

/**
 * Вкладка, где фокус уже стоит в поле focused (ввод без ссылки): Runtime.evaluate отвечает видом
 * поля и его текстом, картинка - строкой PNG. Рука без пауз.
 */
const setup = async (focused: Focused) => {
  const hub = new FakeHub()

  hub.connect('work', 'Work')
  hub.cdp.set('Runtime.evaluate', () => ({
    result: {
      value: {
        ...focused,
        length: focused.length ?? focused.text.length,
        box: { x: 10, y: 20, width: 300, height: 40 },
        dpr: 2,
      },
    },
  }))
  hub.cdp.set('Page.getLayoutMetrics', () => ({
    cssVisualViewport: { pageX: 0, pageY: 100, clientWidth: 800, clientHeight: 600 },
  }))
  hub.cdp.set('Page.captureScreenshot', () => ({ data: 'PNGDATA' }))

  const agent = new BrowserAgent(hub, {
    motion: { random: () => 0.5, sleep: () => Promise.resolve(), now: () => 0 },
  })

  agents.push(agent)

  const page = await agent.open(callOf('p1'), '')
  const cdp = (method: string) =>
    hub
      .calls('cdp')
      .filter((request) => request.params['method'] === method)
      .map((request) => request.params['params'] as Record<string, unknown>)
  /** Что ушло в поле: знаки, вставки и клавиши Enter с модификаторами (8 - Shift). */
  const typed = () =>
    hub
      .calls('cdp')
      .map((request) => request.params as { method: string; params: Record<string, unknown> })
      .flatMap(({ method, params }) => {
        if (method === 'Input.insertText') return [`insert:${String(params['text'])}`]
        if (method !== 'Input.dispatchKeyEvent' || params['type'] !== 'keyDown') return []

        return [params['key'] === 'Enter' ? `Enter+${String(params['modifiers'])}` : params['text']]
      })

  return { hub, page, cdp, typed }
}

describe('набор текста с переводами строк', () => {
  it('в редакторе перевод строки - Shift+Enter, пустая строка - два подряд, голого Enter нет', async () => {
    const { page, typed } = await setup({ kind: 'editable', text: 'Hi\n\nyo' })

    await typeText(page, { text: 'Hi\n\nyo' })

    expect(typed()).toEqual(['H', 'i', 'Enter+8', 'Enter+8', 'y', 'o'])
  })

  it('длинный текст - каждая строка вставкой, между ними Shift+Enter', async () => {
    const lines = [
      'Hello Ana,',
      '',
      'I have two questions about the trip next week, before I book the tickets:',
      '1. When?',
    ]
    const text = lines.join('\r\n')
    const { page, typed } = await setup({ kind: 'editable', text: lines.join('\n') })

    expect(text.length).toBeGreaterThan(80)

    await typeText(page, { text })

    expect(typed()).toEqual([
      'insert:Hello Ana,',
      'Enter+8',
      'Enter+8',
      'insert:I have two questions about the trip next week, before I book the tickets:',
      'Enter+8',
      'insert:1. When?',
    ])
  })

  it('textarea берёт многострочный текст вставкой целиком: перевод строки - знак, не клавиша', async () => {
    const { page, typed } = await setup({ kind: 'textarea', text: 'one\n\ntwo' })

    const check = await typeText(page, { text: 'one\n\ntwo', picture: true })

    expect(typed()).toEqual(['insert:one\n\ntwo'])
    // Текст поля - да, картинка - только у редактора (поле ввода чата).
    expect(check).toEqual({ text: 'one\n\ntwo', picture: null })
  })

  it('textarea медленно - по клавише, и перевод строки там тоже Shift+Enter', async () => {
    const { page, typed } = await setup({ kind: 'textarea', text: 'a\nb' })

    await typeText(page, { text: 'a\nb', slowly: true })

    expect(typed()).toEqual(['a', 'Enter+8', 'b'])
  })

  it('многострочный текст с submit - отказ до первого действия', async () => {
    const { page, cdp } = await setup({ kind: 'editable', text: '' })

    await expect(typeText(page, { text: 'one\ntwo', submit: true })).rejects.toMatchObject({
      code: 'bad-request',
      message: expect.stringMatching(/without submit/) as unknown,
    })
    expect([...cdp('Input.dispatchKeyEvent'), ...cdp('Input.insertText')]).toEqual([])
  })

  it('однострочное поле не берёт переводы строк: отказ, а не склеенные строки', async () => {
    const { page, typed } = await setup({ kind: 'input', text: '' })

    await expect(typeText(page, { text: 'one\ntwo' })).rejects.toThrow(/one-line field/)
    expect(typed()).toEqual([])
  })

  it('однострочный текст - как раньше: по клавише, submit - Enter без Shift, без проверки поля', async () => {
    const { page, typed, cdp } = await setup({ kind: 'input', text: 'Ada' })

    expect(await typeText(page, { text: 'Ada', submit: true, picture: true })).toBeNull()
    expect(typed()).toEqual(['A', 'd', 'a', 'Enter+0'])
    expect(cdp('Page.captureScreenshot')).toEqual([])
  })
})

describe('проверка поля после набора', () => {
  it('редактор без submit: текст по строкам и картинка поля с полями вокруг', async () => {
    const { page, cdp } = await setup({ kind: 'editable', text: 'Hi Ana,\n\nThanks' })

    const check = await typeText(page, { text: 'Hi Ana,\n\nThanks', picture: true })

    expect(check).toEqual({
      text: 'Hi Ana,\n\nThanks',
      picture: { data: 'PNGDATA', mimeType: 'image/png' },
    })
    // Поле 10,20 300×40 в окне, страница прокручена на 100: поля по 12, у края окна - до края.
    expect(cdp('Page.captureScreenshot')[0]?.['clip']).toEqual({
      x: 0,
      y: 108,
      width: 322,
      height: 64,
      scale: 1,
    })
  })

  it('однострочный текст в редактор - тоже с картинкой; в обычное поле - без проверки', async () => {
    const editor = await setup({ kind: 'editable', text: 'ok' })

    expect(await typeText(editor.page, { text: 'ok', picture: true })).toMatchObject({
      text: 'ok',
      picture: { mimeType: 'image/png' },
    })

    const input = await setup({ kind: 'input', text: 'ok' })

    expect(await typeText(input.page, { text: 'ok', picture: true })).toBeNull()
    expect(input.cdp('Page.captureScreenshot')).toEqual([])
  })

  it('картинка не пришла - проверка без неё, набор не падает', async () => {
    const { hub, page } = await setup({ kind: 'editable', text: 'a\nb' })

    hub.cdp.set('Page.captureScreenshot', () => {
      throw new BrowserError('timeout', 'Chrome did not paint the tab.')
    })

    expect(await typeText(page, { text: 'a\nb', picture: true })).toEqual({
      text: 'a\nb',
      picture: null,
    })
  })
})

describe('области и строки', () => {
  it('поле вне видимой части - без картинки; огромное - уменьшено до 1200 точек', () => {
    const view = { pageX: 0, pageY: 0, clientWidth: 800, clientHeight: 600 }

    expect(fieldClip({ x: 10, y: 900, width: 300, height: 40 }, view, 2)).toBeNull()
    expect(fieldClip({ x: 0, y: 0, width: 2000, height: 2000 }, view, 2)).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      scale: 0.75,
    })
  })

  it('переводы строк Windows и старого мака - один \\n', () => {
    expect(normalizeBreaks('a\r\nb\rc\n')).toBe('a\nb\nc\n')
    expect(isMultiline('one line')).toBe(false)
    expect(isMultiline('a\rb')).toBe(true)
  })
})
