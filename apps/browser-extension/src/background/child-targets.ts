import type { FrameTarget } from '@agentic-workstation/browser-protocol/protocol'

/**
 * Фреймы других процессов во вкладках агента (ADR 0040). Cross-origin iframe живёт в своём
 * процессе, и отладчик вкладки его не видит: ни дерева доступности, ни узлов. Chrome подключает
 * к нему отдельную сессию сам (Target.setAutoAttach с flatten), а команды в неё идут через тот
 * же chrome.debugger с sessionId. Сессии знает только расширение - оно держит подключение, -
 * поэтому реестр здесь: IDE называет фрейм его id (у фрейма своего процесса id цели = id
 * фрейма), а сессия - внутреннее дело расширения, она меняется с каждым подключением.
 * Чистый класс: держит тест.
 */

type ChildTarget = FrameTarget & {
  sessionId: string
  /** Сессия, в которой Chrome о нём сообщил: null - сама вкладка, иначе фрейм-родитель. */
  parent: string | null
}

type AttachedParams = {
  sessionId?: unknown
  targetInfo?: { targetId?: unknown; type?: unknown; url?: unknown }
}

export class ChildTargets {
  private readonly byTab = new Map<number, Map<string, ChildTarget>>()

  /**
   * Target.attachedToTarget: запомнить фрейм. Ответ - сессия нового фрейма, чтобы подключиться
   * и к его вложенным фреймам; не фрейм (воркер) - null, его расширение не держит.
   */
  attached(tabId: number, parent: string | null, params: unknown): string | null {
    const { sessionId, targetInfo } = (params ?? {}) as AttachedParams

    if (typeof sessionId !== 'string' || targetInfo?.type !== 'iframe') return null

    if (typeof targetInfo.targetId !== 'string') return null

    const tab = this.byTab.get(tabId) ?? new Map<string, ChildTarget>()

    tab.set(sessionId, {
      sessionId,
      parent,
      frameId: targetInfo.targetId,
      url: typeof targetInfo.url === 'string' ? targetInfo.url : '',
    })
    this.byTab.set(tabId, tab)

    return sessionId
  }

  /** Target.detachedFromTarget: фрейм ушёл - с ним и его вложенные (их сессии жили в нём). */
  detached(tabId: number, params: unknown): void {
    const { sessionId } = (params ?? {}) as { sessionId?: unknown }
    const tab = this.byTab.get(tabId)

    if (!tab || typeof sessionId !== 'string') return

    const gone = [sessionId]

    for (let session = gone.pop(); session !== undefined; session = gone.pop()) {
      tab.delete(session)

      for (const child of tab.values()) if (child.parent === session) gone.push(child.sessionId)
    }
  }

  /** Target.targetInfoChanged: фрейм ушёл на другой адрес - список фреймов скажет новый. */
  changed(tabId: number, params: unknown): void {
    const { targetInfo } = (params ?? {}) as AttachedParams
    const tab = this.byTab.get(tabId)

    if (!tab || typeof targetInfo?.targetId !== 'string') return

    for (const child of tab.values()) {
      if (child.frameId === targetInfo.targetId && typeof targetInfo.url === 'string') {
        child.url = targetInfo.url
      }
    }
  }

  /** Сессия фрейма другого процесса; такого фрейма нет - null. */
  sessionOf(tabId: number, frameId: string): string | null {
    for (const child of this.byTab.get(tabId)?.values() ?? []) {
      if (child.frameId === frameId) return child.sessionId
    }

    return null
  }

  list(tabId: number): FrameTarget[] {
    return [...(this.byTab.get(tabId)?.values() ?? [])].map(({ frameId, url }) => ({
      frameId,
      url,
    }))
  }

  /** Отладчик вкладки отключён: сессии её фреймов ушли вместе с ним. */
  forget(tabId: number): void {
    this.byTab.delete(tabId)
  }
}
