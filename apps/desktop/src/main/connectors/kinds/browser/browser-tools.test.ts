import { rm, mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { it, expect, describe, afterEach, beforeEach } from 'vitest'

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import { isToolEnabled } from '../../tool-access'
import { FakeHub } from '../../../browser/__fixtures__/fake-hub'
import { tabLines } from './browser-tab-list'
import { createBrowserSource } from './browser-tools'

const text = (result: CallToolResult): string =>
  result.content.map((item) => (item.type === 'text' ? item.text : `[${item.type}]`)).join('\n')

describe('инструменты браузера', () => {
  let dir = ''
  let project = ''
  const sources: ReturnType<typeof createBrowserSource>[] = []

  beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'aw-tools-')))
    project = join(dir, 'project')
    await mkdir(project)
    await writeFile(join(project, 'cv.pdf'), 'x')
    await writeFile(join(dir, 'secret.txt'), 'x')
  })

  afterEach(async () => {
    await Promise.all(sources.splice(0).map((source) => source.dispose()))
    await rm(dir, { recursive: true, force: true })
  })

  const setup = () => {
    const hub = new FakeHub()

    hub.connect('work', 'Work')

    const source = createBrowserSource(hub)
    const launch = { id: 'p1', projectPath: project, workDir: project, conversationId: 'tab-1' }

    sources.push(source)

    return {
      hub,
      call: (name: string, args: Record<string, unknown> = {}) =>
        source.callTool(name, args, undefined, launch),
      source,
    }
  }

  it('загрузка - ступень отправки: выключена, пока не включит человек', async () => {
    const { source } = setup()
    const upload = (await source.listTools()).find((tool) => tool.name === 'upload')

    expect(upload?.access).toBe('outbound')
    expect(isToolEnabled('outbound', undefined)).toBe(false)
  })

  it('загрузка - только файлы проекта; модель узнаёт почему', async () => {
    const { call } = setup()
    const outside = await call('upload', { ref: 'e1', files: [join(dir, 'secret.txt')] })

    expect(outside.isError).toBe(true)
    expect(text(outside)).toMatch(/outside this conversation's project folder/)

    // Файл проекта проверку прошёл - дальше нужна вкладка.
    const inside = await call('upload', { ref: 'e1', files: [join(project, 'cv.pdf')] })

    expect(text(inside)).toMatch(/No tab yet/)
  })

  it('адрес file: - только внутри проекта', async () => {
    const { hub, call } = setup()
    const outside = await call('open', { url: pathToFileURL(join(dir, 'secret.txt')).href })

    expect(outside.isError).toBe(true)
    expect(text(outside)).toMatch(/file: addresses open only/)
    expect(hub.calls('tabs.open')).toHaveLength(0)

    const inside = await call('open', { url: pathToFileURL(join(project, 'cv.pdf')).href })

    expect(inside.isError).toBeFalsy()
    expect(hub.calls('tabs.open')).toHaveLength(1)
  })

  /** Вкладка агента, где фокус уже в поле этого вида (ввод без ссылки). */
  const withFocus = async (kind: 'editable' | 'input') => {
    const tools = setup()

    tools.hub.cdp.set('Runtime.evaluate', () => ({
      result: {
        value: { kind, text: 'ok', length: 2, box: { x: 10, y: 10, width: 200, height: 30 } },
      },
    }))
    tools.hub.cdp.set('Page.getLayoutMetrics', () => ({
      cssVisualViewport: { pageX: 0, pageY: 0, clientWidth: 800, clientHeight: 600 },
    }))
    tools.hub.cdp.set('Page.captureScreenshot', () => ({ data: 'PNGDATA' }))
    await tools.call('open', { url: 'https://chat.example/' })

    return tools
  }

  // Сообщение людям не уходит вслепую (ADR 0095): строки и чат модель сверяет до Enter.
  it('type в редактор без submit отвечает текстом поля и его картинкой, в обычное поле - нет', async () => {
    const editor = await withFocus('editable')
    const typed = await editor.call('type', { text: 'ok' })

    expect(typed.isError).toBeFalsy()
    expect(typed.content.map((item) => item.type)).toEqual(['text', 'text', 'image'])
    expect(text(typed)).toContain('The field now reads "ok"')
    expect(typed.content[2]).toMatchObject({ data: 'PNGDATA', mimeType: 'image/png' })

    const input = await withFocus('input')
    const plain = await input.call('type', { text: 'ok' })

    expect(plain.content.map((item) => item.type)).toEqual(['text'])
    expect(
      input.hub.calls('cdp').some((item) => item.params['method'] === 'Page.captureScreenshot'),
    ).toBe(false)
  })

  it('type не берёт многострочный текст с submit и ничего не нажимает', async () => {
    const { hub, call } = await withFocus('editable')
    const refused = await call('type', { text: 'Hi Ana,\n\nThanks', submit: true })

    expect(refused.isError).toBe(true)
    expect(text(refused)).toMatch(/without submit/)
    expect(
      hub.calls('cdp').some((item) => String(item.params['method']).startsWith('Input.')),
    ).toBe(false)
  })

  it('описание type говорит модели про Shift+Enter и проверку до Enter', async () => {
    const { source } = setup()
    const type = (await source.listTools()).find((tool) => tool.name === 'type')

    expect(type?.description).toMatch(/Shift\+Enter.*never Enter/)
    expect(type?.description).toMatch(/picture of the field/)
  })

  it('заметка сессии уходит с ответом инструмента', async () => {
    const { hub, call } = setup()
    const human = hub.addTab('work', { title: 'Draft' })

    await call('take', { tab: `chrome-tab:work/${human.tabId}@run1` })
    hub.emit('work', {
      type: 'event',
      name: 'cdp-event',
      data: {
        tabId: human.tabId,
        method: 'Page.javascriptDialogOpening',
        params: { type: 'beforeunload' },
      },
    })

    const next = await call('profiles')

    expect(text(next)).toMatch(/unsaved changes/)
    expect(text(await call('profiles'))).not.toMatch(/unsaved changes/)
  })
})

describe('список вкладок для модели', () => {
  const profile = {
    key: 'work',
    name: 'Work',
    chromeProfile: null,
    browser: 'Google Chrome',
    version: '0.1.0',
    build: 'b',
    launch: 'run1',
    connectedAt: 0,
  }
  const listing = {
    tabs: Array.from({ length: 30 }, (_, index) => ({
      tabId: index + 1,
      windowId: 1,
      index,
      title: index % 3 ? `Page ${index}` : `Mail ${index}`,
      url: `https://site.example/${index}`,
      active: index === 0,
      groupId: index === 1 ? 7 : -1,
      status: 'complete' as const,
    })),
    groups: [{ groupId: 7, windowId: 1, title: 'AW · web', color: 'orange', collapsed: false }],
    focusedWindowId: 1,
  }

  it('строка на вкладку, предел с «ещё N» и фильтр по заголовку и адресу', () => {
    const lines = tabLines([{ profile, listing }], {
      query: '',
      limit: 5,
      holderOf: (key) => (key === 'work/2' ? 'you' : null),
    }).split('\n')

    expect(lines[0]).toBe('Profile "Work", key work, Google Chrome: 30 of 30 tabs')
    expect(lines[1]).toBe('- chrome-tab:work/1@run1 "Mail 0" https://site.example/0 [active]')
    expect(lines[2]).toBe(
      '- chrome-tab:work/2@run1 "Page 1" https://site.example/1 [group "AW · web"] [held by you]',
    )
    expect(lines).toHaveLength(7)
    expect(lines[6]).toMatch(/25 more/)

    const mail = tabLines([{ profile, listing }], {
      query: 'MAIL',
      limit: 50,
      holderOf: () => null,
    })

    expect(mail.split('\n')[0]).toBe(
      'Profile "Work", key work, Google Chrome: 10 of 30 tabs match "MAIL"',
    )
    expect(mail).not.toMatch(/more/)
  })
})
