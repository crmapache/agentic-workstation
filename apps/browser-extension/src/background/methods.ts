import type { HostChannel, RequestMessage } from '@agentic-workstation/browser-protocol/protocol'

import type { AgentTabs } from './agent-state'
import { pruneAxTree } from './ax-prune'
import type { Debuggers } from './debugger'
import type { HostLink } from './host-link'
import { MethodError } from './method-error'
import type { OverlayControl } from './overlay-control'
import { getTab, openTab, listTabs, closeTabs, ungroupTabs } from './tabs'

export type MethodDeps = {
  debuggers: Debuggers
  overlay: OverlayControl
  agentTabs: AgentTabs
  /** Сессии IDE поменялись - окно значка покажет их. */
  sessionsChanged: () => void
}

const tabIdOf = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new MethodError('bad-request', 'tabId must be a tab id.')
  }

  return value
}

const tabIdsOf = (value: unknown): number[] => {
  if (!Array.isArray(value)) throw new MethodError('bad-request', 'tabIds must be a list.')

  return value.map(tabIdOf)
}

/**
 * Методы, которые зовёт IDE (browser-protocol: BrowserMethods). Отладчик вкладки помнит все
 * IDE, которые его подключили (dev и установленная могут держать одну вкладку): отключается
 * он, только когда отпустила последняя, - иначе одна IDE ломала бы работу другой. Ушла IDE -
 * её вкладки отпускаются, чужие остаются.
 */
export const createMethods = (deps: MethodDeps) => {
  const owners = new Map<number, Set<HostChannel>>()

  /** Отпустить отладчик вкладки от IDE channel; последняя IDE - отключить его совсем. */
  const detachFrom = async (tabId: number, channel: HostChannel): Promise<null> => {
    const channels = owners.get(tabId)

    channels?.delete(channel)

    if (channels?.size) return null

    owners.delete(tabId)

    return deps.debuggers.detach(tabId)
  }

  const cdp = async (tabId: number, method: string, params: Record<string, unknown>) => {
    const result = await deps.debuggers.send(tabId, method, params)

    // Полное дерево длинной страницы - десятки мегабайт: IDE получает прореженное (ax-prune).
    if (method === 'Accessibility.getFullAXTree') {
      return pruneAxTree((result as { nodes?: unknown[] } | null)?.nodes ?? [])
    }

    return result
  }

  const handle = async (request: RequestMessage, link: HostLink): Promise<unknown> => {
    const { channel } = link

    switch (request.method) {
      case 'tabs.list':
        return listTabs()
      case 'tabs.get':
        return getTab(tabIdOf(request.params.tabId))
      case 'tabs.open': {
        const groupTitle = String(request.params.groupTitle ?? '').slice(0, 80)
        const opened = await openTab({
          url: String(request.params.url ?? ''),
          groupId: typeof request.params.groupId === 'number' ? request.params.groupId : null,
          groupTitle,
        })

        await deps.agentTabs.opened(channel, opened.tab, opened.groupId, groupTitle)

        return opened
      }
      case 'tabs.close': {
        const tabIds = tabIdsOf(request.params.tabIds)

        await closeTabs(tabIds)
        await deps.agentTabs.closed(tabIds)

        return null
      }
      case 'tabs.ungroup':
        return ungroupTabs(tabIdsOf(request.params.tabIds))
      case 'debugger.attach': {
        const tabId = tabIdOf(request.params.tabId)

        await deps.debuggers.attach(tabId)
        owners.set(tabId, (owners.get(tabId) ?? new Set()).add(channel))

        return null
      }
      case 'debugger.detach':
        return detachFrom(tabIdOf(request.params.tabId), channel)
      case 'cdp':
        return cdp(
          tabIdOf(request.params.tabId),
          String(request.params.method),
          request.params.params ?? {},
        )
      case 'overlay.frame':
        return deps.overlay.frame(
          tabIdOf(request.params.tabId),
          request.params.on === true,
          channel,
        )
      case 'overlay.cursor':
        return deps.overlay.cursor(
          tabIdOf(request.params.tabId),
          Number(request.params.x),
          Number(request.params.y),
          request.params.action,
        )
      case 'sessions.set':
        link.sessions = Array.isArray(request.params.sessions) ? request.params.sessions : []
        deps.sessionsChanged()
        await deps.agentTabs.sessions(channel, link.sessions)

        return null
      default:
        throw new MethodError('bad-request', 'Unknown method.')
    }
  }

  /**
   * IDE ушла (вышла, упала, host закрылся): отладчики, которые держала только она, отключить,
   * рамки - снять. Её вкладки агента ждут её возвращения (AgentTabs).
   */
  const release = async (channel: HostChannel, keep: ReadonlySet<number> = new Set()) => {
    for (const [tabId, channels] of [...owners]) {
      if (channels.has(channel) && !keep.has(tabId)) await detachFrom(tabId, channel)
    }

    await deps.overlay.release(channel, keep)
  }

  /** Отладчик с вкладки снят без IDE (закрыли вкладку, «Отмена» в плашке Chrome). */
  const forget = (tabId: number) => owners.delete(tabId)

  return { handle, release, forget }
}
