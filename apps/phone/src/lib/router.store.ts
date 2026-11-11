import { create } from 'zustand'

import type { Route } from './routes'
import { parentOf, routePath, parseRoute } from './routes'

type RouterState = {
  route: Route
  /** Сколько шагов внутри приложения позади: 0 - «назад» уйдёт из него, ведём к родителю. */
  depth: number
  navigate: (route: Route, options?: { replace?: boolean }) => void
  back: () => void
  /** Браузер сам сделал шаг (кнопка «назад», жест). */
  synced: () => void
}

const depthOf = (state: unknown): number =>
  typeof state === 'object' && state !== null && 'depth' in state && typeof state.depth === 'number'
    ? state.depth
    : 0

/**
 * Адрес экрана - интерфейсное состояние, его держит Zustand: History API пишет адрес, а этот
 * стор - разобранный экран и глубину, чтобы «назад» внутри приложения шёл по истории, а с
 * открытого по ссылке экрана - к родителю.
 */
export const useRouter = create<RouterState>((set, get) => ({
  route: parseRoute(window.location.pathname),
  depth: depthOf(window.history.state),
  navigate: (route, options = {}) => {
    const path = routePath(route)
    const depth = options.replace ? get().depth : get().depth + 1

    if (options.replace) window.history.replaceState({ depth }, '', path)
    else window.history.pushState({ depth }, '', path)

    set({ route: parseRoute(path), depth })
    window.scrollTo(0, 0)
  },
  back: () => {
    if (get().depth > 0) return window.history.back()

    get().navigate(parentOf(get().route), { replace: true })
  },
  synced: () =>
    set({ route: parseRoute(window.location.pathname), depth: depthOf(window.history.state) }),
}))
