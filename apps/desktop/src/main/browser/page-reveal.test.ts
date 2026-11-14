import { it, expect, describe, afterEach } from 'vitest'

import { BrowserAgent } from './browser-agent'
import { MAIN_FRAME } from './frame-refs'
import type { ElementRef } from './frame-refs'
import { click } from './page-actions'
import { callOf, FakeHub } from './__fixtures__/fake-hub'

const agents: BrowserAgent[] = []

afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.dispose()))
})

/**
 * Вкладка с элементом e1 в главном документе и f1e1 во фрейме процесса страницы. Страница
 * отвечает на план прокрутки по очереди из plans, на «доехала?» - местом из settled.
 */
const setup = (plans: unknown[], settled: number[]) => {
  const hub = new FakeHub()

  hub.connect('work', 'Work')
  hub.cdp.set('DOM.resolveNode', () => ({ object: { objectId: 'obj' } }))
  hub.cdp.set('Runtime.callFunctionOn', (params) => {
    const body = String(params['functionDeclaration'])
    const value = body.includes('screens') ? (plans.shift() ?? { done: true }) : settled

    return { result: { value: { gone: false, value } } }
  })
  hub.cdp.set('DOM.getContentQuads', () => ({ quads: [[100, 100, 140, 100, 140, 120, 100, 120]] }))

  // Рука без пауз и с серединой вместо разброса.
  const agent = new BrowserAgent(hub, {
    motion: { random: () => 0.5, sleep: () => Promise.resolve(), now: () => 0 },
  })

  agents.push(agent)

  return { hub, agent }
}

const open = async (agent: BrowserAgent) => {
  const page = await agent.open(callOf('p1'), '')
  const frame = { id: 'f1', target: null, parent: MAIN_FRAME, owner: 10 }

  page.setRefs(
    new Map<string, ElementRef>([
      ['e1', { node: 5, frame: MAIN_FRAME }],
      ['f1e1', { node: 7, frame }],
    ]),
  )

  return page
}

const cdpCalls = (hub: FakeHub, method: string) =>
  hub
    .calls('cdp')
    .filter((request) => request.params['method'] === method)
    .map((request) => ({
      frame: request.params['frame'] as string | undefined,
      params: request.params['params'] as Record<string, unknown>,
    }))

const wheels = (hub: FakeHub) =>
  cdpCalls(hub, 'Input.dispatchMouseEvent').filter((call) => call.params['type'] === 'mouseWheel')

describe('прокрутка к элементу рукой', () => {
  it('мышь встаёт в точку плана и крутит колесо, пока элемент не на виду; прыжка нет', async () => {
    const { hub, agent } = setup(
      [{ done: false, point: { x: 400, y: 300 }, dx: 0, dy: 900, at: [100, 1000] }, { done: true }],
      [100, 100],
    )

    await click(await open(agent), { ref: 'e1' })

    const events = cdpCalls(hub, 'Input.dispatchMouseEvent')
    const firstWheel = events.findIndex((call) => call.params['type'] === 'mouseWheel')

    expect(events[firstWheel - 1]?.params).toMatchObject({ type: 'mouseMoved', x: 400, y: 300 })
    expect(wheels(hub).every((call) => call.params['x'] === 400 && call.params['y'] === 300)).toBe(
      true,
    )
    expect(wheels(hub).reduce((sum, call) => sum + Number(call.params['deltaY']), 0)).toBe(900)
    expect(wheels(hub).length).toBeGreaterThan(3)
    expect(cdpCalls(hub, 'DOM.scrollIntoViewIfNeeded')).toEqual([])
    expect(events.at(-1)?.params).toMatchObject({ type: 'mouseReleased', x: 120, y: 110 })
  })

  it('страница от колеса не сдвинулась - прежний прыжок, клик всё равно доходит', async () => {
    const { hub, agent } = setup(
      [{ done: false, point: { x: 400, y: 300 }, dx: 0, dy: 900, at: [100, 1000] }],
      [100, 1000],
    )

    await click(await open(agent), { ref: 'e1' })

    expect(wheels(hub).length).toBeGreaterThan(0)
    expect(cdpCalls(hub, 'DOM.scrollIntoViewIfNeeded')).toHaveLength(1)
    expect(
      cdpCalls(hub, 'Input.dispatchMouseEvent').some(
        (call) => call.params['type'] === 'mousePressed',
      ),
    ).toBe(true)
  })

  it('колесу негде встать (всё под мышью крутит другое) - прыжок без колеса', async () => {
    const { hub, agent } = setup(
      [{ done: false, point: null, dx: 0, dy: 900, at: [100, 1000] }],
      [100, 1000],
    )

    await click(await open(agent), { ref: 'e1' })

    expect(wheels(hub)).toEqual([])
    expect(cdpCalls(hub, 'DOM.scrollIntoViewIfNeeded')).toHaveLength(1)
  })

  it('элемент во фрейме: колесо - до его iframe в главном документе, внутри - программно', async () => {
    const { hub, agent } = setup([{ done: true }], [0, 0])

    await click(await open(agent), { ref: 'f1e1' })

    const plans = cdpCalls(hub, 'Runtime.callFunctionOn')

    expect(plans).toHaveLength(1)
    expect(plans[0]?.frame).toBeUndefined()
    expect(cdpCalls(hub, 'DOM.resolveNode')[0]?.params['backendNodeId']).toBe(10)
    expect(
      cdpCalls(hub, 'DOM.scrollIntoViewIfNeeded').map((call) => call.params['backendNodeId']),
    ).toEqual([7])
  })
})
