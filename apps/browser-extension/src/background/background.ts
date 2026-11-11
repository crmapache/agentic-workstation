import { HOST_CHANNELS } from '@agentic-workstation/browser-protocol/protocol'
import type {
  HostChannel,
  EventMessage,
  WelcomeMessage,
} from '@agentic-workstation/browser-protocol/protocol'

import { shouldReload, buildFromVersionName } from '../common/build-id'
import { isPopupRequest } from '../common/messages'
import type { PopupState, PopupChanged, PopupRequest } from '../common/messages'
import { AgentTabs } from './agent-state'
import { copyTabReference } from './clipboard'
import { Debuggers } from './debugger'
import { HostLink } from './host-link'
import { createMethods } from './methods'
import { OverlayControl } from './overlay-control'
import { loadProfile, renameProfile, newLaunchMarker } from './profile'
import { tabInfo } from './tabs'

/**
 * Сервис-воркер расширения (ADR 0040): связь с IDE (установленной и dev), методы, которые она
 * зовёт, события вкладок и отладчика, пункт меню «Copy tab reference for AI», окно значка.
 */

const COPY_MENU = 'copy-tab-reference'
const RELOAD_TRIED = 'reloadTriedFor'
const OWN_BUILD = buildFromVersionName(chrome.runtime.getManifest().version_name)

const notifyPopup = (): void => {
  const message: PopupChanged = { type: 'popup:changed' }

  chrome.runtime.sendMessage(message).catch(() => undefined)
}

const broadcast = (event: EventMessage): void => {
  for (const link of links) link.send(event)
}

const debuggers = new Debuggers(broadcast, (tabId) => methods.forget(tabId))
const overlay = new OverlayControl()
const agentTabs = new AgentTabs((channel, keep) => methods.release(channel, keep))
const methods = createMethods({ debuggers, overlay, agentTabs, sessionsChanged: notifyPopup })

/**
 * IDE положила в папку другую сборку - перезагрузиться и взять её с диска. Не посреди работы
 * агента (отладчик подключён) и один раз на сборку (shouldReload).
 */
const maybeReload = async (welcome: WelcomeMessage): Promise<void> => {
  const stored = await chrome.storage.local.get(RELOAD_TRIED)
  const tried = typeof stored[RELOAD_TRIED] === 'string' ? stored[RELOAD_TRIED] : null

  if (debuggers.count > 0 || !shouldReload(OWN_BUILD, welcome.extensionBuild, tried)) return

  await chrome.storage.local.set({ [RELOAD_TRIED]: welcome.extensionBuild })
  chrome.runtime.reload()
}

const links: HostLink[] = HOST_CHANNELS.map(
  (channel) =>
    new HostLink(channel, {
      hello: async () => {
        const profile = await loadProfile()

        return {
          type: 'hello',
          profileKey: profile.key,
          profileName: profile.name,
          browser: profile.browser,
          version: chrome.runtime.getManifest().version,
          build: OWN_BUILD,
          launch: profile.launch,
        }
      },
      handle: methods.handle,
      welcome: (welcome, link) => {
        agentTabs.welcome(link.channel)
        void maybeReload(welcome)
      },
      // IDE ушла: её отладчики и рамки - снять сразу, её вкладки агента ждут её (AgentTabs).
      gone: (link) => {
        agentTabs.gone(link.channel)
        void methods.release(link.channel)
      },
      changed: notifyPopup,
    }),
)

const linkOf = (channel: HostChannel): HostLink | undefined =>
  links.find((link) => link.channel === channel)

const popupState = async (retry: boolean): Promise<PopupState> => {
  // Только при открытии окна: перерисовка по «изменилось» не пробует связи заново, иначе проба
  // меняла бы состояние, окно перерисовывалось и пробовало снова - окно дёргалось без конца.
  if (retry) for (const link of links) link.retry()

  const [profile, [active]] = await Promise.all([
    loadProfile(),
    chrome.tabs.query({ active: true, lastFocusedWindow: true }),
  ])

  return {
    profile,
    links: links.map((link) => link.view()),
    tab: active?.id === undefined ? null : { id: active.id, title: active.title ?? '' },
  }
}

const answerPopup = async (request: PopupRequest): Promise<unknown> => {
  switch (request.type) {
    case 'popup:state':
      return popupState(request.retry === true)
    case 'popup:rename': {
      const profile = await renameProfile(request.name)

      broadcast({ type: 'event', name: 'profile-renamed', data: { name: profile.name } })

      return popupState(false)
    }
    case 'popup:stop':
      linkOf(request.channel)?.send({
        type: 'event',
        name: 'session-stop',
        data: { sessionId: request.sessionId },
      })

      return null
    case 'popup:copy': {
      const [profile, tab] = await Promise.all([loadProfile(), chrome.tabs.get(request.tabId)])

      await copyTabReference(profile, tab)

      return true
    }
  }
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  if (!isPopupRequest(message)) return false

  answerPopup(message).then(respond, (error: unknown) => respond({ error: String(error) }))

  return true
})

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: COPY_MENU,
      title: chrome.i18n.getMessage('copyReference'),
      contexts: ['page', 'frame', 'selection', 'link', 'image', 'action'],
    })
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== COPY_MENU || !tab) return

  void loadProfile()
    .then((profile) => copyTabReference(profile, tab))
    .catch((error: unknown) => console.warn('Agentic Workstation: copy failed', error))
})

/**
 * Chrome стартовал (не перезапуск сервис-воркера и не перезагрузка расширения - тогда id
 * вкладок прежние): новая метка запуска для ссылок, рамки прошлого запуска забыты, группы
 * агента, которые Chrome восстановит, закрываются - их сессий больше нет.
 */
chrome.runtime.onStartup.addListener(() => {
  const marker = newLaunchMarker()

  void overlay.browserStarted()
  void agentTabs.browserStarted()
  // hello мог уйти раньше этого события - со старой меткой.
  void marker.then(() => Promise.all(links.map((link) => link.rehello())))
})

chrome.tabs.onRemoved.addListener((tabId) => {
  methods.forget(tabId)
  void agentTabs.closed([tabId])
  broadcast({ type: 'event', name: 'tab-removed', data: { tabId } })
})

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url !== undefined) void agentTabs.urlChanged(tabId, change.url)

  if (!debuggers.isAttached(tabId)) return

  if (change.status || change.url !== undefined || change.title !== undefined) {
    broadcast({ type: 'event', name: 'tab-updated', data: { tab: tabInfo(tab) } })
  }
})

chrome.tabGroups.onCreated.addListener((group) => void agentTabs.groupSeen(group))
chrome.tabGroups.onUpdated.addListener((group) => void agentTabs.groupSeen(group))

chrome.tabGroups.onRemoved.addListener((group) => {
  broadcast({ type: 'event', name: 'group-removed', data: { groupId: group.id } })
})

// Каждый запуск сервис-воркера (старт Chrome, установка, пробуждение по событию) - связь с IDE.
for (const link of links) link.connect()
