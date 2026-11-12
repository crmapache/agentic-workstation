import { it, expect, describe, afterEach } from 'vitest'

import { BrowserAgent } from './browser-agent'
import { MAIN_FRAME } from './frame-refs'
import { callOf, FakeHub } from './__fixtures__/fake-hub'

const agents: BrowserAgent[] = []

const setup = () => {
  const hub = new FakeHub()

  hub.connect('work', 'Work')

  const agent = new BrowserAgent(hub)

  agents.push(agent)

  return { hub, agent }
}

afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.dispose()))
})

const dialog = (hub: FakeHub, tabId: number, type: string) =>
  hub.emit('work', {
    type: 'event',
    name: 'cdp-event',
    data: {
      tabId,
      method: 'Page.javascriptDialogOpening',
      params: { type, message: 'Leave site?' },
    },
  })

const answers = (hub: FakeHub) =>
  hub
    .calls('cdp')
    .filter((call) => call.params['method'] === 'Page.handleJavaScriptDialog')
    .map((call) => call.params['params'])

describe('события расширения', () => {
  it('«Покинуть сайт?» на вкладке человека - остаться и сказать модели; на своей - уйти', async () => {
    const { hub, agent } = setup()
    const call = callOf('p1')
    const human = hub.addTab('work')
    const taken = await agent.page(call, {
      profileKey: 'work',
      tabId: human.tabId,
      launch: 'run1',
      title: null,
    })
    const own = await agent.open(call, '')

    dialog(hub, taken.tab.tabId, 'beforeunload')
    await expect.poll(() => answers(hub)).toEqual([{ accept: false }])
    expect(agent.takeNotes(call).join(' ')).toMatch(/unsaved changes.*Ask the user/)
    expect(agent.takeNotes(call)).toEqual([])

    dialog(hub, own.tab.tabId, 'beforeunload')
    dialog(hub, taken.tab.tabId, 'confirm')
    await expect
      .poll(() => answers(hub))
      .toEqual([{ accept: false }, { accept: true }, { accept: true }])
    expect(taken.tab.console.at(-2)?.text).toMatch(/dismissed/)
  })

  it('«Отмена» на плашке Chrome - как Stop: вкладки закрыты, модели - объяснение один раз', async () => {
    const { hub, agent } = setup()
    const call = callOf('p1', 'tab-1')
    const page = await agent.open(call, '')

    hub.emit('work', {
      type: 'event',
      name: 'debugger-detached',
      data: { tabId: page.tab.tabId, reason: 'canceled_by_user' },
    })

    await expect.poll(() => hub.tab('work', page.tab.tabId)).toBeUndefined()
    expect(() => agent.session(call)).toThrow(/Cancel on the "started debugging/)
    expect(agent.session(call).tabs.size).toBe(0)
  })

  it('страница сменила адрес или документ - ссылки снимка сброшены', async () => {
    const { hub, agent } = setup()
    const page = await agent.open(callOf('p1'), 'https://example.com/a')

    page.setRefs(new Map([['e1', { node: 5, frame: MAIN_FRAME }]]))
    hub.emit('work', {
      type: 'event',
      name: 'tab-updated',
      data: { tab: { ...hub.tab('work', page.tab.tabId)!, url: 'https://example.com/a' } },
    })
    expect(page.tab.refs.size).toBe(1)

    hub.emit('work', {
      type: 'event',
      name: 'tab-updated',
      data: { tab: { ...hub.tab('work', page.tab.tabId)!, url: 'https://example.com/b' } },
    })
    expect(page.tab.refs.size).toBe(0)
    expect(() => page.elementOf('e1')).toThrow(/Take a new snapshot/)

    page.setRefs(new Map([['e1', { node: 5, frame: MAIN_FRAME }]]))
    hub.emit('work', {
      type: 'event',
      name: 'cdp-event',
      data: {
        tabId: page.tab.tabId,
        method: 'Page.frameNavigated',
        params: { frame: { id: 'child', parentId: 'main' } },
      },
    })
    expect(page.tab.refs.size).toBe(1)
    hub.emit('work', {
      type: 'event',
      name: 'cdp-event',
      data: {
        tabId: page.tab.tabId,
        method: 'Page.frameNavigated',
        params: { frame: { id: 'main' } },
      },
    })
    expect(page.tab.refs.size).toBe(0)
  })
})
