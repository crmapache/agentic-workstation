import { create } from 'zustand'

import { newId } from './ids'
import type { Route } from './routes'
import { parentOf, routePath, parseRoute } from './routes'

type NavigateOptions = { replace?: boolean }

type Navigate = (route: Route, options?: NavigateOptions) => void

type RouterState = {
  route: Route
  /** Сколько шагов внутри приложения позади: 0 - «назад» уйдёт из него, ведём к родителю. */
  depth: number
  /**
   * Запись истории, на которой стоит человек: у каждого шага своя (и у замены тоже), «назад» и
   * «вперёд» возвращают её же. По ней итог команды узнаёт, ушёл ли человек с экрана, где её
   * начал (navigateFromHere).
   */
  entry: string
  navigate: Navigate
  back: () => void
  /** Браузер сам сделал шаг (кнопка «назад», жест). */
  synced: () => void
}

/** Что телефон пишет в history.state каждой своей записи. */
type Step = { depth: number; entry: string }

const depthOf = (state: unknown): number =>
  typeof state === 'object' && state !== null && 'depth' in state && typeof state.depth === 'number'
    ? state.depth
    : 0

const entryOf = (state: unknown): string | null =>
  typeof state === 'object' && state !== null && 'entry' in state && typeof state.entry === 'string'
    ? state.entry
    : null

/**
 * Шаг текущей записи. Запись без него (первая загрузка страницы, запись прежней версии
 * клиента) получает его сразу на месте: «назад» на неё потом вернёт тот же id.
 */
const currentStep = (): Step => {
  const state: unknown = window.history.state
  const depth = depthOf(state)
  const entry = entryOf(state)

  if (entry !== null) return { depth, entry }

  const step = { depth, entry: newId() }

  window.history.replaceState(step, '')

  return step
}

/**
 * Адрес экрана - интерфейсное состояние, его держит Zustand: History API пишет адрес, а этот
 * стор - разобранный экран, глубину и запись, чтобы «назад» внутри приложения шёл по истории, а
 * с открытого по ссылке экрана - к родителю.
 */
export const useRouter = create<RouterState>((set, get) => ({
  route: parseRoute(window.location.pathname),
  ...currentStep(),
  navigate: (route, options = {}) => {
    const path = routePath(route)
    const step = { depth: options.replace ? get().depth : get().depth + 1, entry: newId() }

    if (options.replace) window.history.replaceState(step, '', path)
    else window.history.pushState(step, '', path)

    set({ route: parseRoute(path), ...step })
    window.scrollTo(0, 0)
  },
  back: () => {
    if (get().depth > 0) {
      // Шаг браузера приходит не сразу (popstate), а человек уже уходит: итог команды,
      // пришедший в этот промежуток, тоже не должен его уводить.
      set({ entry: newId() })

      return window.history.back()
    }

    get().navigate(parentOf(get().route), { replace: true })
  },
  synced: () => set({ route: parseRoute(window.location.pathname), ...currentStep() }),
}))

/**
 * Переход по итогу того, что человек начал на этом экране (команда IDE, пара): запись берётся в
 * момент начала, переход - только если человек всё ещё на ней. Ответ IDE идёт через релей сотни
 * миллисекунд (черновик и пара - минуты), и человек успевает нажать «назад» или открыть другой
 * экран. Без этой проверки поздний ответ уводил бы его с экрана, который он выбрал сам, а
 * replace ещё и стирал бы этот экран из истории.
 */
export const navigateFromHere = (): Navigate => {
  const { entry } = useRouter.getState()

  return (route, options) => {
    const router = useRouter.getState()

    if (router.entry === entry) router.navigate(route, options)
  }
}
