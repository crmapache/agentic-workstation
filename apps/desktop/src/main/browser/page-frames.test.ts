import { it, expect, describe, afterEach } from 'vitest'

import type { AxNode } from './ax-snapshot'
import { BrowserAgent } from './browser-agent'
import { BrowserError } from './browser-error'
import { click, typeText } from './page-actions'
import { MAX_FRAMES } from './page-frames'
import { snapshot } from './page-read'
import { callOf, FakeHub } from './__fixtures__/fake-hub'

const agents: BrowserAgent[] = []

/** Фреймы, у которых свой процесс, а значит, и своя сессия отладчика. */
const OWN_PROCESS = new Set(['CROSS', 'DEEP'])

afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.dispose()))
})

/** Дерево документа, как его отдаёт Accessibility.getFullAXTree: корень и его дети по порядку. */
const tree = (title: string, children: [role: string, name: string, backend: number][]) => ({
  nodes: [
    {
      nodeId: 'root',
      role: { value: 'RootWebArea' },
      name: { value: title },
      childIds: children.map((_, index) => `n${index}`),
    },
    ...children.map(([role, name, backend], index): AxNode => ({
      nodeId: `n${index}`,
      parentId: 'root',
      role: { value: role },
      name: { value: name },
      backendDOMNodeId: backend,
    })),
  ],
})

/**
 * Страница с фреймами: «Same» - фрейм процесса страницы, «Cross» - фрейм другого процесса, в нём
 * «Deep» - ещё один фрейм своего процесса. Фрейм своего процесса читается своей сессией, его
 * узлы - в координатах его окна; место его iframe - getBoxModel в сессии родителя.
 */
const setup = () => {
  const hub = new FakeHub()

  hub.connect('work', 'Work')
  hub.frameTargets = [
    { frameId: 'CROSS', url: 'https://pay.example/' },
    { frameId: 'DEEP', url: 'https://shop.example/deep' },
  ]

  const owners: Record<string, Record<number, string>> = {
    main: { 10: 'SAME', 20: 'CROSS' },
    CROSS: { 40: 'DEEP' },
  }
  const documents: Record<string, ReturnType<typeof tree>> = {
    main: tree('Shop', [
      ['Iframe', 'Same', 10],
      ['Iframe', 'Cross', 20],
      ['button', 'Top', 30],
    ]),
    SAME: tree('Same doc', [['button', 'Inside same', 11]]),
    CROSS: tree('Pay', [
      ['textbox', 'Card', 21],
      ['Iframe', 'Deep', 40],
    ]),
    DEEP: tree('Deep doc', [['button', 'Deep button', 41]]),
  }
  const boxes: Record<string, Record<number, number[]>> = {
    main: { 20: [100, 200, 500, 200, 500, 500, 100, 500] },
    CROSS: { 40: [30, 40, 230, 40, 230, 140, 30, 140] },
  }

  hub.cdp.set('DOM.describeNode', (params, _key, frame) => ({
    node: { frameId: owners[frame ?? 'main']?.[params['backendNodeId'] as number] },
  }))
  hub.cdp.set('Accessibility.getFullAXTree', (params, _key, frame) => {
    const frameId = params['frameId'] as string | undefined
    // Сессия вкладки знает только фреймы своего процесса - как Chrome.
    const document =
      frameId && OWN_PROCESS.has(frameId) ? null : documents[frame ?? frameId ?? 'main']

    if (!document) throw new BrowserError('cdp', 'Frame with the given frameId is not found.')

    return document
  })
  hub.cdp.set('DOM.getBoxModel', (params, _key, frame) => ({
    model: { content: boxes[frame ?? 'main']?.[params['backendNodeId'] as number] ?? [] },
  }))
  // Каждый узел - квадрат 10 на 10 в начале окна своего документа.
  hub.cdp.set('DOM.getContentQuads', () => ({ quads: [[0, 0, 10, 0, 10, 10, 0, 10]] }))

  // Рука без пауз и с серединой вместо разброса: путь и точка нажатия - предсказуемые.
  const agent = new BrowserAgent(hub, {
    motion: { random: () => 0.5, sleep: () => Promise.resolve(), now: () => 0 },
  })

  agents.push(agent)

  return { hub, agent }
}

/** Команды CDP, ушедшие в расширение: имя, фрейм и параметры. */
const cdpCalls = (hub: FakeHub, method: string) =>
  hub
    .calls('cdp')
    .filter((request) => request.params['method'] === method)
    .map((request) => ({
      frame: request.params['frame'] as string | undefined,
      params: request.params['params'] as Record<string, unknown>,
    }))

describe('фреймы в снимке и действиях', () => {
  it('снимок собирает документы фреймов обоих видов, ссылки несут фрейм', async () => {
    const { hub, agent } = setup()
    const page = await agent.open(callOf('p1'), '')
    const text = await snapshot(page)

    expect(text).toContain(
      [
        '- iframe "Same" [ref=e1] [frame=f1]',
        '  - button "Inside same" [ref=f1e1]',
        '- iframe "Cross" [ref=e2] [frame=f2]',
        '  - textbox "Card" [ref=f2e1]',
        '  - iframe "Deep" [ref=f2e2] [frame=f3]',
        '    - button "Deep button" [ref=f3e1]',
        '- button "Top" [ref=e3]',
      ].join('\n'),
    )
    // Фрейм процесса страницы - по frameId в сессии вкладки, другого процесса - своей сессией.
    expect(cdpCalls(hub, 'Accessibility.getFullAXTree')).toEqual([
      { frame: undefined, params: {} },
      { frame: undefined, params: { frameId: 'SAME' } },
      { frame: 'CROSS', params: {} },
      { frame: 'DEEP', params: {} },
    ])
    expect(page.tab.refs.get('f3e1')?.frame).toMatchObject({ id: 'f3', target: 'DEEP' })
    expect(page.tab.refs.get('f1e1')?.frame).toMatchObject({ id: 'f1', target: null })
    expect(hub.calls('debugger.frames')).toHaveLength(1)
  })

  it('клик во фрейме другого процесса: узел - его сессией, мышь - вкладкой со сдвигом фреймов', async () => {
    const { hub, agent } = setup()
    const page = await agent.open(callOf('p1'), '')

    await snapshot(page)
    await click(page, { ref: 'f3e1' })

    // Окно Deep начинается в (30, 40) окна Cross, а оно - в (100, 200) страницы. Мышь идёт
    // к точке путём событий движения во вкладке, потом нажатие и отпускание там же.
    const moves = cdpCalls(hub, 'Input.dispatchMouseEvent')
    const ends = moves.slice(-3)

    expect(moves.every((move) => move.frame === undefined)).toBe(true)
    expect(moves.length).toBeGreaterThan(4)
    expect(ends.map((move) => [move.params['type'], move.params['x'], move.params['y']])).toEqual([
      ['mouseMoved', 135, 245],
      ['mousePressed', 135, 245],
      ['mouseReleased', 135, 245],
    ])
    // Сначала iframe-ы - в видимую часть, от внешнего к внутреннему, потом сам элемент.
    expect(
      cdpCalls(hub, 'DOM.scrollIntoViewIfNeeded').map((call) => [
        call.frame,
        call.params['backendNodeId'],
      ]),
    ).toEqual([
      [undefined, 20],
      ['CROSS', 40],
      ['DEEP', 41],
    ])
    expect(cdpCalls(hub, 'DOM.getContentQuads').map((call) => call.frame)).toEqual(['DEEP'])
  })

  it('фрейм процесса страницы: координаты уже страницы, без сдвига; ввод - функцией в его документе', async () => {
    const { hub, agent } = setup()
    const page = await agent.open(callOf('p1'), '')

    hub.cdp.set('DOM.resolveNode', () => ({ object: { objectId: 'obj' } }))
    hub.cdp.set('Runtime.callFunctionOn', () => ({
      result: { value: { gone: false, value: { tag: 'input', type: 'text', checked: false } } },
    }))
    await snapshot(page)
    await click(page, { ref: 'f1e1' })

    expect(cdpCalls(hub, 'DOM.getBoxModel')).toEqual([])
    expect(
      cdpCalls(hub, 'Input.dispatchMouseEvent').find(
        (move) => move.params['type'] === 'mousePressed',
      )?.params,
    ).toMatchObject({ x: 5, y: 5 })

    await typeText(page, { ref: 'f2e1', text: 'Ada' })

    // Функции поля - в документе его фрейма; в главном документе - только план прокрутки
    // колесом к iframe фрейма (page-reveal.ts).
    const functions = cdpCalls(hub, 'Runtime.callFunctionOn')

    expect(functions.some((call) => call.frame === 'CROSS')).toBe(true)
    expect(
      functions
        .filter((call) => call.frame !== 'CROSS')
        .every(
          (call) =>
            call.frame === undefined &&
            String(call.params['functionDeclaration']).includes('screens'),
        ),
    ).toBe(true)
    // Короткий текст - по клавише, как у человека: нажатия видят сайт и его подсказки.
    expect(
      cdpCalls(hub, 'Input.dispatchKeyEvent')
        .filter((call) => call.params['type'] === 'keyDown')
        .map((call) => [call.frame, call.params['text']]),
    ).toEqual([
      [undefined, 'A'],
      [undefined, 'd'],
      [undefined, 'a'],
    ])
    expect(cdpCalls(hub, 'Input.insertText')).toEqual([])
  })

  it('фрейм ушёл - «возьми новый снимок»; фрейм не прочесть - строка iframe без содержимого', async () => {
    const { hub, agent } = setup()
    const page = await agent.open(callOf('p1'), '')

    hub.cdp.set('Accessibility.getFullAXTree', (params, _key, frame) => {
      if (params['frameId'] === 'SAME') throw new BrowserError('cdp', 'Frame detached.')

      return frame === 'CROSS'
        ? tree('Pay', [['textbox', 'Card', 21]])
        : tree('Shop', [
            ['Iframe', 'Same', 10],
            ['Iframe', 'Cross', 20],
          ])
    })

    const text = await snapshot(page)

    expect(text).toContain('- iframe "Same" [ref=e1]\n- iframe "Cross" [ref=e2] [frame=f1]')

    hub.cdp.set('DOM.scrollIntoViewIfNeeded', (_params, _key, frame) => {
      if (frame === 'CROSS') throw new BrowserError('no-frame', 'The frame CROSS is gone.')

      return {}
    })

    await expect(click(page, { ref: 'f1e1' })).rejects.toThrow(
      'Element f1e1 is gone from the page. Take a new snapshot.',
    )
  })

  it('расширение старой сборки без списка фреймов - фреймы другого процесса просто не читаются', async () => {
    const { hub, agent } = setup()
    const page = await agent.open(callOf('p1'), '')

    hub.overrides.set('debugger.frames', () => {
      throw new BrowserError('bad-request', 'Unknown method.')
    })

    const text = await snapshot(page)

    expect(text).toContain('- iframe "Same" [ref=e1] [frame=f1]')
    expect(text).toContain('- iframe "Cross" [ref=e2]\n- button "Top"')
  })

  it('фреймов больше предела - читаются первые', async () => {
    const { hub, agent } = setup()
    const page = await agent.open(callOf('p1'), '')
    const count = MAX_FRAMES + 5

    hub.cdp.set('DOM.describeNode', (params) => ({
      node: { frameId: `F${String(params['backendNodeId'])}` },
    }))
    hub.cdp.set('Accessibility.getFullAXTree', (params) =>
      params['frameId']
        ? tree('Ad', [['button', 'Ad', 9000]])
        : tree(
            'Ads',
            Array.from({ length: count }, (_, index) => ['Iframe', `Ad ${index}`, index + 1]),
          ),
    )

    const text = await snapshot(page)

    expect(text).toContain(`[frame=f${MAX_FRAMES}]`)
    expect(text).not.toContain(`[frame=f${MAX_FRAMES + 1}]`)
  })
})
