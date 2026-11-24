import { it, expect, describe, afterEach } from 'vitest'

import type { AxNode } from './ax-snapshot'
import { BrowserAgent } from './browser-agent'
import { MAIN_FRAME } from './frame-refs'
import type { ElementRef } from './frame-refs'
import { click } from './page-click'
import { callOf, FakeHub } from './__fixtures__/fake-hub'

const agents: BrowserAgent[] = []

afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.dispose()))
})

/** Полоса «Aceptar | Rechazar | Seguir»: узлы 1, 2, 3, у каждой своя коробка 100 на 40. */
const BUTTONS: Record<number, string> = { 1: 'Aceptar', 2: 'Rechazar', 3: 'Seguir' }

/**
 * Вкладка с полосой кнопок. under - какой узел под мышью на каждой проверке по очереди (последний
 * повторяется); boxes - где кнопка e1 при каждом прицеливании по очереди.
 */
const setup = (under: number[], boxes: number[] = [0]) => {
  const hub = new FakeHub()

  hub.connect('work', 'Work')
  hub.cdp.set('DOM.resolveNode', () => ({ object: { objectId: 'obj' } }))
  hub.cdp.set('Runtime.callFunctionOn', () => ({
    result: { value: { gone: false, value: { done: true } } },
  }))
  hub.cdp.set('DOM.getContentQuads', () => {
    const left = boxes.length > 1 ? (boxes.shift() ?? 0) : (boxes[0] ?? 0)

    return { quads: [[left, 0, left + 100, 0, left + 100, 40, left, 40]] }
  })
  hub.cdp.set('DOM.getNodeForLocation', () => ({
    backendNodeId: under.length > 1 ? under.shift() : under[0],
  }))
  hub.cdp.set('Accessibility.getPartialAXTree', (params) => {
    const node = params['backendNodeId'] as number
    const nodes: AxNode[] = [
      node in BUTTONS
        ? {
            nodeId: `n${node}`,
            parentId: 'root',
            role: { value: 'button' },
            name: { value: BUTTONS[node] },
            backendDOMNodeId: node,
          }
        : {
            nodeId: `n${node}`,
            parentId: 'root',
            role: { value: 'Canvas' },
            backendDOMNodeId: node,
          },
      { nodeId: 'root', role: { value: 'RootWebArea' }, name: { value: 'Invite' } },
    ]

    return { nodes }
  })

  const agent = new BrowserAgent(hub, {
    motion: { random: () => 0.5, sleep: () => Promise.resolve(), now: () => 0 },
  })

  agents.push(agent)

  return { hub, agent }
}

const open = async (agent: BrowserAgent) => {
  const page = await agent.open(callOf('p1'), '')

  page.setRefs(new Map<string, ElementRef>([['e1', { node: 1, frame: MAIN_FRAME }]]))

  return page
}

const presses = (hub: FakeHub) =>
  hub
    .calls('cdp')
    .filter((request) => request.params['method'] === 'Input.dispatchMouseEvent')
    .map((request) => request.params['params'] as Record<string, unknown>)
    .filter((params) => params['type'] === 'mousePressed')

describe('клик со сверкой попадания', () => {
  it('ref на месте: нажата кнопка, ответ называет её', async () => {
    const { hub, agent } = setup([1])

    expect(await click(await open(agent), { ref: 'e1' })).toBe('button "Aceptar"')
    expect(presses(hub)).toHaveLength(1)
  })

  it('полоса сдвинулась, пока мышь шла: прицел заново - и нажата «Aceptar» на новом месте', async () => {
    const { hub, agent } = setup([2, 1], [0, 100])

    expect(await click(await open(agent), { ref: 'e1' })).toBe('button "Aceptar"')
    expect(presses(hub)).toHaveLength(1)
    expect(presses(hub)[0]).toMatchObject({ x: 150, y: 20 })
  })

  it('и после второго прицела под мышью чужая кнопка - ничего не нажато', async () => {
    const { hub, agent } = setup([2], [0, 100])

    await expect(click(await open(agent), { ref: 'e1' })).rejects.toThrow(
      'Element e1 moved or is covered: under the pointer is button "Rechazar" now. Nothing was clicked. Take a new snapshot and try again with its ref.',
    )
    expect(presses(hub)).toHaveLength(0)
  })

  it('x,y с expect «Aceptar», а под точкой «Rechazar» - отказ, ноль нажатий', async () => {
    const { hub, agent } = setup([2])

    await expect(click(await open(agent), { x: 50, y: 20 }, { expect: 'Aceptar' })).rejects.toThrow(
      'Under the pointer is button "Rechazar", not "Aceptar". Nothing was clicked.',
    )
    expect(presses(hub)).toHaveLength(0)
  })

  it('x,y в кнопку без expect - отказ с подсказкой про ref', async () => {
    const { hub, agent } = setup([1])

    await expect(click(await open(agent), { x: 50, y: 20 })).rejects.toThrow(
      'Under (50, 20) is button "Aceptar". Nothing was clicked. Click it by ref from a fresh snapshot',
    )
    expect(presses(hub)).toHaveLength(0)
  })

  it('x,y по холсту без expect - клик проходит, ответ называет холст', async () => {
    const { hub, agent } = setup([9])

    expect(await click(await open(agent), { x: 50, y: 20 })).toBe('Canvas')
    expect(presses(hub)).toHaveLength(1)
  })

  it('двойной клик сверяет и второе нажатие: ушло - отказ с тем, куда ушло первое', async () => {
    const { hub, agent } = setup([1, 2])

    await expect(click(await open(agent), { ref: 'e1' }, { double: true })).rejects.toThrow(
      'The first click of the double click went to button "Aceptar", the second was not sent.',
    )
    expect(presses(hub)).toHaveLength(1)
  })

  it('страница прокручена: под мышью ищется в координатах документа, а не окна', async () => {
    const { hub, agent } = setup([9])

    hub.cdp.set('Page.getLayoutMetrics', () => ({ cssLayoutViewport: { pageX: 0, pageY: 2500 } }))
    await click(await open(agent), { x: 50, y: 20 })

    const located = hub
      .calls('cdp')
      .find((request) => request.params['method'] === 'DOM.getNodeForLocation')

    expect(located?.params['params']).toMatchObject({ x: 50, y: 2520 })
  })

  it('страница не ответила на проверку: по ref - отказ, по x,y без expect - клик', async () => {
    const failing = setup([1])

    failing.hub.cdp.set('DOM.getNodeForLocation', () => {
      throw new Error('Target closed')
    })
    await expect(click(await open(failing.agent), { ref: 'e1' })).rejects.toThrow(
      'under the pointer is nothing the page can name now',
    )
    expect(await click(await open(failing.agent), { x: 5, y: 5 })).toBe('nothing the page can name')
  })
})
