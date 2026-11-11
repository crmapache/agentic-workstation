import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest'

import type { Route } from './routes'

const AGENT = 'AAAAAAAAAAAAAAAAAAAAAA'

const PROJECT = 'p-BBBBBBBBBBBBBBBBBBBBBB'

const SCENARIOS: Route = { name: 'scenarios', agentId: AGENT, projectKey: PROJECT }

const DRAFT: Route = { name: 'draft', agentId: AGENT, projectKey: PROJECT }

const SAVED: Route = {
  name: 'scenario',
  agentId: AGENT,
  projectKey: PROJECT,
  scope: 'project',
  scenarioId: 'drafted',
}

/**
 * История браузера без браузера: записи с адресом и state, push, replace, «назад» и «вперёд».
 * Шаг браузера, как настоящий, приходит отдельно (popstate) - тест зовёт synced сам.
 */
const fakeBrowser = (path: string, state: unknown = null) => {
  const entries = [{ path, state }]
  let at = 0
  const current = () => entries[at] ?? { path: '/', state: null }

  const history = {
    get state() {
      return current().state
    },
    pushState: (next: unknown, _unused: string, url: string) => {
      entries.splice(at + 1, entries.length, { path: url, state: structuredClone(next) })
      at += 1
    },
    replaceState: (next: unknown, _unused: string, url?: string) => {
      entries[at] = { path: url ?? current().path, state: structuredClone(next) }
    },
    back: () => {
      at = Math.max(0, at - 1)
    },
    forward: () => {
      at = Math.min(entries.length - 1, at + 1)
    },
  }

  return {
    window: {
      history,
      location: {
        get pathname() {
          return current().path
        },
      },
      scrollTo: () => undefined,
    },
    paths: () => entries.map((entry) => entry.path),
  }
}

/** Свежий стор поверх своей истории: он читает адрес и state при создании. */
const routerOn = async (browser: ReturnType<typeof fakeBrowser>) => {
  vi.stubGlobal('window', browser.window)

  return import('./router.store')
}

beforeEach(() => vi.resetModules())

afterEach(() => vi.unstubAllGlobals())

describe('переход по итогу команды', () => {
  it('человек на том же экране - итог ведёт дальше, заменяя экран', async () => {
    const browser = fakeBrowser('/')
    const { useRouter, navigateFromHere } = await routerOn(browser)

    useRouter.getState().navigate(SCENARIOS)
    useRouter.getState().navigate(DRAFT)

    const navigate = navigateFromHere()

    navigate(SAVED, { replace: true })

    expect(useRouter.getState().route).toEqual(SAVED)
    expect(browser.paths()).toEqual([
      '/',
      `/m/${AGENT}/p/${PROJECT}/scenarios`,
      `/m/${AGENT}/p/${PROJECT}/s/project/drafted`,
    ])
  })

  it('человек ушёл назад, пока шёл ответ, - итог не уводит и не стирает выбранный экран', async () => {
    const browser = fakeBrowser('/')
    const { useRouter, navigateFromHere } = await routerOn(browser)

    useRouter.getState().navigate(SCENARIOS)
    useRouter.getState().navigate(DRAFT)

    const navigate = navigateFromHere()

    useRouter.getState().back()
    // Ответ пришёл раньше шага браузера (popstate) - и после него.
    navigate(SAVED, { replace: true })
    useRouter.getState().synced()
    navigate(SAVED, { replace: true })

    expect(useRouter.getState().route).toEqual(SCENARIOS)
    expect(browser.paths()).toEqual([
      '/',
      `/m/${AGENT}/p/${PROJECT}/scenarios`,
      `/m/${AGENT}/p/${PROJECT}/draft`,
    ])
  })

  it('экран заменили, пока шёл ответ, - это тоже уход', async () => {
    const { useRouter, navigateFromHere } = await routerOn(fakeBrowser('/'))

    useRouter.getState().navigate(DRAFT)

    const navigate = navigateFromHere()

    useRouter.getState().navigate(SCENARIOS, { replace: true })
    navigate(SAVED)

    expect(useRouter.getState().route).toEqual(SCENARIOS)
  })

  it('«назад» и «вперёд» возвращают ту же запись: вернулся к экрану - итог снова его', async () => {
    const browser = fakeBrowser('/')
    const { useRouter, navigateFromHere } = await routerOn(browser)

    useRouter.getState().navigate(DRAFT)

    const navigate = navigateFromHere()

    browser.window.history.back()
    useRouter.getState().synced()
    browser.window.history.forward()
    useRouter.getState().synced()
    navigate(SAVED, { replace: true })

    expect(useRouter.getState().route).toEqual(SAVED)
  })

  it('открытая по ссылке страница и запись прежней версии получают id на месте', async () => {
    const browser = fakeBrowser(`/m/${AGENT}/p/${PROJECT}/draft`, { depth: 2 })
    const { useRouter } = await routerOn(browser)
    const { entry, depth } = useRouter.getState()

    expect(depth).toBe(2)
    expect(entry).toMatch(/^[\w-]{16}$/)
    expect(browser.window.history.state).toEqual({ depth: 2, entry })
  })
})
