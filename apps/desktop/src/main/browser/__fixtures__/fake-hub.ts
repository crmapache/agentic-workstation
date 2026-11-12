import type {
  TabInfo,
  GroupInfo,
  FrameTarget,
  EventMessage,
  BrowserMethod,
  BrowserMethods,
} from '@agentic-workstation/browser-protocol/protocol'

import type { AgentCall } from '../browser-agent'
import { BrowserError } from '../browser-error'
import type { HubPort, BrowserProfile, HubLinkListener, HubEventListener } from '../browser-hub'

type Request = { profileKey: string; method: BrowserMethod; params: Record<string, unknown> }

type Override = (params: Record<string, unknown>, profileKey: string) => unknown

/** Ответ на команду CDP; frame - фрейм другого процесса, в чью сессию она ушла. */
type CdpHandler = (
  params: Record<string, unknown>,
  profileKey: string,
  frame: string | undefined,
) => unknown

/**
 * Chrome с расширением глазами IDE, без браузера: вкладки, группы, отладчик и рамка в памяти,
 * каждый запрос записан. Для тестов агента браузера (ADR 0040).
 */
export class FakeHub implements HubPort {
  readonly requests: Request[] = []
  readonly attached = new Set<string>()
  readonly framed = new Set<string>()
  /** Команды CDP по имени: ответ или исключение. */
  readonly cdp = new Map<string, CdpHandler>()
  /** Фреймы других процессов, к которым «подключён» отладчик вкладки (debugger.frames). */
  frameTargets: FrameTarget[] = []
  /** Подмена метода расширения целиком (например, tabs.open, который ждёт). */
  readonly overrides = new Map<BrowserMethod, Override>()
  private readonly connected = new Map<string, BrowserProfile>()
  private readonly tabs = new Map<string, TabInfo[]>()
  private readonly groups = new Map<string, GroupInfo[]>()
  private readonly eventListeners = new Set<HubEventListener>()
  private readonly linkListeners = new Set<HubLinkListener>()
  private nextTab = 100
  private nextGroup = 1

  connect(key: string, name = key, launch = 'run1'): void {
    this.connected.set(key, {
      key,
      name,
      launch,
      browser: 'Google Chrome',
      version: '0.1.0',
      build: 'b',
      connectedAt: 0,
    })
    this.tabs.set(key, this.tabs.get(key) ?? [])
    this.groups.set(key, this.groups.get(key) ?? [])
    // Новый hello: отладчики прежней связи сняты расширением.
    for (const item of [...this.attached])
      if (item.startsWith(`${key}/`)) this.attached.delete(item)

    for (const listener of this.linkListeners) listener(key, true)
  }

  disconnect(key: string): void {
    this.connected.delete(key)

    for (const listener of this.linkListeners) listener(key, false)
  }

  /** Вкладка человека в профиле. */
  addTab(key: string, tab: Partial<TabInfo> = {}): TabInfo {
    const info: TabInfo = {
      tabId: this.nextTab++,
      windowId: 1,
      index: 0,
      title: 'Human tab',
      url: 'https://example.com/',
      active: false,
      groupId: -1,
      status: 'complete',
      ...tab,
    }

    this.tabs.get(key)?.push(info)

    return info
  }

  tab(key: string, tabId: number): TabInfo | undefined {
    return this.tabs.get(key)?.find((tab) => tab.tabId === tabId)
  }

  /** Человек перезапустил Chrome: вкладки и группы - заново, с новыми id. */
  restartChrome(key: string, launch: string): void {
    this.tabs.set(key, [])
    this.groups.set(key, [])
    this.connect(key, this.connected.get(key)?.name ?? key, launch)
  }

  emit(key: string, event: EventMessage): void {
    for (const listener of this.eventListeners) listener(key, event)
  }

  calls(method: BrowserMethod): Request[] {
    return this.requests.filter((request) => request.method === method)
  }

  profiles(): BrowserProfile[] {
    return [...this.connected.values()]
  }

  profile(key: string): BrowserProfile | null {
    return this.connected.get(key) ?? null
  }

  onEvent(listener: HubEventListener): () => void {
    this.eventListeners.add(listener)

    return () => this.eventListeners.delete(listener)
  }

  onProfiles(): () => void {
    return () => undefined
  }

  onLink(listener: HubLinkListener): () => void {
    this.linkListeners.add(listener)

    return () => this.linkListeners.delete(listener)
  }

  request<M extends BrowserMethod>(
    profileKey: string,
    method: M,
    params: BrowserMethods[M]['params'],
  ): Promise<BrowserMethods[M]['result']> {
    const record = params as Record<string, unknown>

    this.requests.push({ profileKey, method, params: record })

    if (!this.connected.has(profileKey)) {
      return Promise.reject(new BrowserError('profile-offline', 'Profile is not connected.'))
    }

    const override = this.overrides.get(method)

    try {
      const result = override
        ? override(record, profileKey)
        : this.answer(profileKey, method, record)

      return Promise.resolve(result as BrowserMethods[M]['result'])
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private answer(key: string, method: BrowserMethod, params: Record<string, unknown>): unknown {
    const tabs = this.tabs.get(key) ?? []
    const tabId = params['tabId'] as number
    const at = `${key}/${tabId}`

    switch (method) {
      case 'tabs.list':
        return { tabs, groups: this.groups.get(key) ?? [], focusedWindowId: 1 }
      case 'tabs.get':
        return this.tab(key, tabId) ?? null
      case 'tabs.open':
        return this.open(key, params)
      case 'tabs.close':
        this.tabs.set(
          key,
          tabs.filter((tab) => !(params['tabIds'] as number[]).includes(tab.tabId)),
        )
        this.dropEmptyGroups(key)

        return null
      case 'tabs.ungroup':
        for (const tab of tabs) {
          if ((params['tabIds'] as number[]).includes(tab.tabId)) tab.groupId = -1
        }

        this.dropEmptyGroups(key)

        return null
      case 'debugger.attach': {
        const tab = this.tab(key, tabId)

        if (!tab) throw new BrowserError('no-tab', 'No tab.')

        if (/^chrome:|chromewebstore/.test(tab.url)) {
          throw new BrowserError(
            'attach-failed',
            "Can't control this tab: Cannot access a chrome:// URL",
          )
        }

        this.attached.add(at)

        return null
      }
      case 'debugger.detach':
        this.attached.delete(at)

        return null
      case 'debugger.frames':
        if (!this.attached.has(at)) throw new BrowserError('not-attached', 'Not attached.')

        return { frames: this.frameTargets }
      case 'cdp': {
        if (!this.attached.has(at)) throw new BrowserError('not-attached', 'Not attached.')

        const handler = this.cdp.get(params['method'] as string)
        const frame = params['frame'] as string | undefined

        return handler ? handler(params['params'] as Record<string, unknown>, key, frame) : {}
      }
      case 'overlay.frame':
        if (params['on']) this.framed.add(at)
        else this.framed.delete(at)

        return null
      default:
        return null
    }
  }

  private open(key: string, params: Record<string, unknown>) {
    const wanted = params['groupId'] as number | null
    const groups = this.groups.get(key) ?? []
    const live = groups.find((group) => group.groupId === wanted)
    const group = live ?? {
      groupId: this.nextGroup++,
      windowId: 1,
      title: params['groupTitle'] as string,
      color: 'orange',
      collapsed: false,
    }

    if (!live) groups.push(group)

    const tab = this.addTab(key, {
      url: (params['url'] as string) || 'about:blank',
      title: 'Agent tab',
      groupId: group.groupId,
    })

    return { tab, groupId: group.groupId }
  }

  private dropEmptyGroups(key: string): void {
    const tabs = this.tabs.get(key) ?? []

    this.groups.set(
      key,
      (this.groups.get(key) ?? []).filter((group) =>
        tabs.some((tab) => tab.groupId === group.groupId),
      ),
    )
  }
}

/** Вызов агента от процесса launchId разговора conversationId. */
export const callOf = (
  launchId: string | null,
  conversationId: string | null = null,
  signal?: AbortSignal,
): AgentCall => ({
  launchId,
  conversationId,
  projectPath: '/work/project',
  workDir: '/work/project',
  signal,
})
