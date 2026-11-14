import { it, expect, describe, afterEach } from 'vitest'

import { BrowserAgent } from './browser-agent'
import { callOf, FakeHub } from './__fixtures__/fake-hub'

const agents: BrowserAgent[] = []

/** Агент над подделкой Chrome; ожидание нового процесса разговора - короткое. */
const setup = (graceMs = 40) => {
  const hub = new FakeHub()

  hub.connect('work', 'Work')

  const agent = new BrowserAgent(hub, { graceMs })

  agents.push(agent)

  return { hub, agent }
}

const tabIdOf = (page: { tab: { tabId: number } }) => page.tab.tabId

afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.dispose()))
})

describe('сессия браузера - на разговор, а не на процесс', () => {
  it('новый процесс того же разговора подхватывает вкладки; без нового - закрываются после ожидания', async () => {
    const { hub, agent } = setup()
    const page = await agent.open(callOf('p1', 'tab-1'), '')

    agent.release({ id: 'p1', conversationId: 'tab-1' })
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Второй процесс разговора пришёл раньше срока - вкладка его.
    const again = await agent.page(callOf('p2', 'tab-1'))

    expect(tabIdOf(again)).toBe(tabIdOf(page))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(hub.tab('work', tabIdOf(page))).toBeDefined()

    agent.release({ id: 'p2', conversationId: 'tab-1' })
    await expect.poll(() => hub.tab('work', tabIdOf(page))).toBeUndefined()
  })

  it('пока жив другой процесс разговора, конец одного сессию не отпускает', async () => {
    const { hub, agent } = setup()
    const page = await agent.open(callOf('p1', 'tab-1'), '')

    await agent.page(callOf('p2', 'tab-1'))
    agent.release({ id: 'p1', conversationId: 'tab-1' })
    await new Promise((resolve) => setTimeout(resolve, 80))

    expect(hub.tab('work', tabIdOf(page))).toBeDefined()
  })

  it('закрытый разговор закрывает свои вкладки сразу', async () => {
    const { hub, agent } = setup(60_000)
    const page = await agent.open(callOf('p1', 'tab-1'), '')

    agent.release({ id: 'p1', conversationId: 'tab-1' })
    agent.endConversation('tab-1')

    await expect.poll(() => hub.tab('work', tabIdOf(page))).toBeUndefined()
  })

  it('процесс без разговора - сессия его, кончается вместе с ним', async () => {
    const { hub, agent } = setup(60_000)
    const page = await agent.open(callOf('solo'), '')

    agent.release({ id: 'solo', conversationId: null })

    await expect.poll(() => hub.tab('work', tabIdOf(page))).toBeUndefined()
  })

  it('вызов кончившегося процесса отказывается и не открывает вкладку', async () => {
    const { hub, agent } = setup(60_000)

    agent.release({ id: 'p1', conversationId: 'tab-1' })

    await expect(agent.open(callOf('p1', 'tab-1'), '')).rejects.toMatchObject({ code: 'aborted' })
    expect(hub.calls('tabs.open')).toHaveLength(0)
  })
})

describe('вкладка, открытая посреди конца сессии или отмены, не остаётся сиротой', () => {
  it('сессию закончили, пока Chrome открывал вкладку, - новая вкладка закрывается', async () => {
    const { hub, agent } = setup()
    let resume = () => undefined as void
    const opened = new Promise<void>((resolve) => {
      resume = resolve
    })

    hub.overrides.set('tabs.open', () => {
      hub.overrides.delete('tabs.open')

      return opened.then(() =>
        hub.request('work', 'tabs.open', { url: '', groupId: null, groupTitle: 'AW' }),
      )
    })

    const call = callOf('p1', 'tab-1')
    const pending = agent.open(call, '')

    await expect.poll(() => agent.sessions.get('tab-1')).not.toBeNull()
    await agent.finish('tab-1')
    resume()

    await expect(pending).rejects.toMatchObject({ code: 'aborted' })

    const [created] = hub.calls('tabs.close')

    expect(created?.params['tabIds']).toHaveLength(1)
    expect(hub.tab('work', (created?.params['tabIds'] as number[])[0] ?? -1)).toBeUndefined()
  })

  it('отменённый вызов не обрывает открытие, а закрывает вкладку после ответа', async () => {
    const { hub, agent } = setup()
    const controller = new AbortController()

    hub.overrides.set('tabs.open', (params, key) => {
      hub.overrides.delete('tabs.open')
      controller.abort()

      return hub.request(
        key,
        'tabs.open',
        params as { url: string; groupId: null; groupTitle: string },
      )
    })

    await expect(agent.open(callOf('p1', 'tab-1', controller.signal), '')).rejects.toMatchObject({
      code: 'aborted',
    })
    expect(hub.calls('tabs.close')).toHaveLength(1)
  })
})

describe('конец сессии', () => {
  it('закрывает свои вкладки в группе; вытащенную человеком - отпускает; чужую из группы - выводит', async () => {
    const { hub, agent } = setup()
    const call = callOf('p1', 'tab-1')
    const kept = await agent.open(call, '')
    const dragged = await agent.open(call, '')
    const groupId = hub.tab('work', tabIdOf(kept))?.groupId ?? -1
    const human = hub.addTab('work', { groupId })

    // Человек вытащил вкладку агента из группы и перетащил свою в группу агента.
    hub.tab('work', tabIdOf(dragged))!.groupId = -1

    expect(await agent.finishCall(call)).toEqual({ closed: 1, released: 1 })
    expect(hub.tab('work', tabIdOf(kept))).toBeUndefined()
    expect(hub.tab('work', tabIdOf(dragged))).toBeDefined()
    expect(hub.attached.has(`work/${tabIdOf(dragged)}`)).toBe(false)
    expect(hub.framed.has(`work/${tabIdOf(dragged)}`)).toBe(false)
    expect(hub.tab('work', human.tabId)?.groupId).toBe(-1)
  })
})

describe('конец сессии в двух профилях', () => {
  it('свои вкладки закрываются в каждом профиле, где агент их открыл', async () => {
    const { hub, agent } = setup()
    const call = callOf('p1', 'tab-1')

    hub.connect('home', 'Home')

    const work = await agent.open(call, '', 'work')
    const home = await agent.open(call, '', 'home')

    expect(await agent.finishCall(call)).toEqual({ closed: 2, released: 0 })
    expect(hub.tab('work', work.tab.tabId)).toBeUndefined()
    expect(hub.tab('home', home.tab.tabId)).toBeUndefined()
  })
})

describe('профили', () => {
  it('два профиля с одним именем - отказ со списком ключей, по ключу - можно', () => {
    const { hub, agent } = setup()

    hub.connect('home', 'Work')

    const session = agent.session(callOf('p1'))

    expect(() => agent.pickProfile(session, 'Work')).toThrow(/named "Work".*key work.*key home/s)
    expect(agent.pickProfile(session, 'home')).toBe('home')
  })

  it('профиль проекта - когда модель профиль не назвала; группа сессии важнее', async () => {
    const hub = new FakeHub()
    const agent = new BrowserAgent(hub, {
      projectProfile: (path) => (path === '/p/improving' ? 'Improving' : null),
    })

    agents.push(agent)
    hub.connect('work')
    hub.connect('impr', 'Google Chrome', 'run1', 'Improving')

    const call = { ...callOf('p1'), projectPath: '/p/improving' }

    expect(agent.pickProfile(agent.session(call), undefined, '/p/improving')).toBe('impr')
    expect(() => agent.pickProfile(agent.session(call), undefined, '/p/other')).toThrow(
      /pass "profile"/,
    )

    await agent.open(call, '')
    hub.connect('impr2', 'Second', 'run1', 'Other')
    expect(agent.pickProfile(agent.session(call), undefined, '/p/improving')).toBe('impr')

    const away = new BrowserAgent(hub, { projectProfile: () => 'Gone' })

    agents.push(away)
    expect(() => away.pickProfile(away.session(callOf('p2')), undefined, '/p/x')).toThrow(
      /This project works in the Chrome profile "Gone", and it is not connected/,
    )
  })

  it('закрытый профиль проекта - IDE открывает его окно и ждёт расширение', async () => {
    const hub = new FakeHub()
    const opened: string[] = []
    const agent = new BrowserAgent(hub, {
      projectProfile: () => 'Improving',
      openProfile: (name) => {
        opened.push(name)
        setTimeout(() => hub.connect('impr', 'Google Chrome', 'run1', 'Improving'), 5)

        return Promise.resolve('opened')
      },
    })

    agents.push(agent)
    hub.connect('max', 'Max')

    const page = await agent.open({ ...callOf('p1'), projectPath: '/p/improving' }, '')

    expect(opened).toEqual(['Improving'])
    expect(page.tab.profileKey).toBe('impr')
  })

  it('в закрытом профиле нет расширения - отказ говорит, что поставить', async () => {
    const hub = new FakeHub()
    const agent = new BrowserAgent(hub, {
      openProfile: () => Promise.resolve('no-extension'),
    })

    agents.push(agent)
    hub.connect('max', 'Max')

    await expect(agent.open(callOf('p1'), '', 'Claude Work')).rejects.toThrow(
      /"Claude Work" has no Agentic Workstation extension/,
    )
  })

  it('по профилю Chrome - и тогда, когда копии дали своё имя', () => {
    const { hub, agent } = setup()

    hub.connect('impr', 'Job', 'run1', 'Improving')

    const session = agent.session(callOf('p1'))

    expect(agent.pickProfile(session, 'improving')).toBe('impr')
    expect(() => agent.pickProfile(session, 'Support')).toThrow(
      /"Job" \(Chrome profile "Improving"\), key impr/,
    )
  })

  it('профиль отключился и вернулся - вкладки сверены, а не забыты', async () => {
    const { hub, agent } = setup()
    const page = await agent.open(callOf('p1', 'tab-1'), '')
    const key = `work/${tabIdOf(page)}`

    hub.disconnect('work')
    expect(agent.sessions.get('tab-1')?.tabs.get(key)).toMatchObject({
      offline: true,
      attached: false,
    })

    hub.connect('work', 'Work')
    await expect.poll(() => agent.sessions.get('tab-1')?.tabs.get(key)?.offline).toBe(false)
    expect(hub.calls('sessions.set').at(-1)?.params['sessions']).toEqual([
      { id: 'tab-1', title: 'AW · project', tabIds: [tabIdOf(page)] },
    ])

    // Следующий вызов подключает отладчик заново: прежняя связь его потеряла.
    await agent.page(callOf('p1', 'tab-1'))
    expect(hub.attached.has(key)).toBe(true)
  })

  it('Chrome перезапустился (другая метка) - прежние вкладки и группа забываются', async () => {
    const { hub, agent } = setup()
    const page = await agent.open(callOf('p1', 'tab-1'), '')

    hub.disconnect('work')
    hub.restartChrome('work', 'run2')
    // Новая вкладка с тем же id - уже чужая.
    hub.addTab('work', { tabId: tabIdOf(page) })

    await expect.poll(() => agent.sessions.get('tab-1')?.tabs.size).toBe(0)
    expect(agent.sessions.get('tab-1')?.group).toBeNull()
  })
})

describe('ссылки на вкладки', () => {
  it('ссылка из прежнего запуска Chrome не берёт вкладку', async () => {
    const { hub, agent } = setup()
    const human = hub.addTab('work', { title: 'Inbox' })

    await expect(
      agent.page(callOf('p1'), {
        profileKey: 'work',
        tabId: human.tabId,
        launch: 'old',
        title: 'Inbox',
      }),
    ).rejects.toThrow(/earlier Chrome session/)
    expect(hub.calls('debugger.attach')).toHaveLength(0)
  })

  it('ссылка без метки: другой заголовок - отказ, тот же (со счётчиком) - вкладка взята', async () => {
    const { hub, agent } = setup()
    const human = hub.addTab('work', { title: 'Inbox (4) - Mail' })
    const wanted = { profileKey: 'work', tabId: human.tabId, launch: null }

    await expect(agent.page(callOf('p1'), { ...wanted, title: 'Bank - Sign in' })).rejects.toThrow(
      /now "Inbox \(4\) - Mail"/,
    )

    const page = await agent.page(callOf('p1'), { ...wanted, title: 'Inbox (3) - Mail' })

    expect(page.tab).toMatchObject({ owned: false, launch: 'run1' })
    expect(hub.framed.has(`work/${human.tabId}`)).toBe(true)
  })
})

describe('вкладки, куда Chrome не пускает отладчик', () => {
  it('взятая не застревает текущей и отпускается; close_tab закрывает свою без отладчика', async () => {
    const { hub, agent } = setup()
    const call = callOf('p1')
    const own = await agent.open(call, '')
    const store = hub.addTab('work', { url: 'https://chromewebstore.google.com/' })

    await expect(
      agent.page(call, { profileKey: 'work', tabId: store.tabId, launch: 'run1', title: null }),
    ).rejects.toMatchObject({ code: 'attach-failed' })
    expect(agent.sessions.get('p1')?.current).toBe(own.tab.key)
    expect(agent.sessions.get('p1')?.tabs.has(`work/${store.tabId}`)).toBe(false)

    // Своя вкладка ушла в магазин расширений: Chrome снял отладчик.
    hub.tab('work', tabIdOf(own))!.url = 'https://chromewebstore.google.com/detail/x'
    hub.attached.delete(own.tab.key)
    hub.emit('work', {
      type: 'event',
      name: 'debugger-detached',
      data: { tabId: tabIdOf(own), reason: 'target_closed' },
    })
    await expect.poll(() => agent.sessions.get('p1')?.current).toBeNull()
    expect(agent.takeNotes(call).join(' ')).toMatch(/out of the agent's control/)

    const attaches = hub.calls('debugger.attach').length
    const closed = await agent.closeTab(call, {
      profileKey: 'work',
      tabId: tabIdOf(own),
      launch: null,
      title: null,
    })

    expect(closed.tabId).toBe(tabIdOf(own))
    expect(hub.tab('work', tabIdOf(own))).toBeUndefined()
    expect(hub.calls('debugger.attach')).toHaveLength(attaches)
  })

  it('отладчик сняли без нас (вторая IDE отпустила вкладку) - один раз подключиться заново', async () => {
    const { hub, agent } = setup()
    const page = await agent.open(callOf('p1'), '')

    hub.cdp.set('Runtime.evaluate', () => ({ result: { value: 2 } }))
    hub.attached.delete(page.tab.key)

    await expect(page.cdp('Runtime.evaluate', { expression: '1 + 1' })).resolves.toEqual({
      result: { value: 2 },
    })
    expect(hub.calls('debugger.attach')).toHaveLength(2)
    expect(page.tab.attached).toBe(true)
  })
})
