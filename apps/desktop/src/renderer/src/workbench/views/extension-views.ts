import { lazy, useMemo, useEffect, createElement } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'

import type { ExtensionView } from '@shared/extensions'

import { extensionIcon } from '../../lib/extension-icons'
import { useExtensions } from '../../state/extensions.queries'
import { useLayoutStore } from '../../state/layout.store'
import type { MainViewId, ExtensionViewId } from '../../state/layout.types'
import { MAIN_VIEWS, MAIN_BAR_VIEWS } from './main-views'
import { SIDE_VIEWS } from './side-views'
import type { ViewDescriptor } from './views.types'

/** Сколько вид расширения может пропасть (перезагрузка), прежде чем область уйдёт с него. */
const GONE_MS = 3000

const pages = new Map<string, LazyExoticComponent<ComponentType>>()

/** Страница вида расширения - один ленивый компонент на ключ: ViewStack держит его смонтированным. */
const pageOf = (key: string): LazyExoticComponent<ComponentType> => {
  const known = pages.get(key)

  if (known) return known

  const page = lazy(() =>
    import('../../features/extensions/ExtensionPage/ExtensionPage').then((module) => ({
      default: () => createElement(module.ExtensionPage, { viewKey: key }),
    })),
  )

  pages.set(key, page)

  return page
}

const descriptorOf = (view: ExtensionView): ViewDescriptor<ExtensionViewId> => ({
  id: `ext:${view.key}`,
  icon: extensionIcon(view.icon),
  label: view.title,
  keywords: ['extension'],
  Component: pageOf(view.key),
})

/**
 * Виды полос и областей окна вместе с видами расширений (ADR 0091): свои иконки встают после
 * видов IDE - в середине окна и в левой панели. Значки расширений - числа на их иконках.
 */
export const useViewLists = () => {
  const { data } = useExtensions()

  return useMemo(() => {
    const views = data?.extensions.flatMap((extension) => extension.contributions.views) ?? []
    const main = views.filter((view) => view.place === 'main').map(descriptorOf)
    const side = views.filter((view) => view.place === 'side').map(descriptorOf)

    return {
      main: [...MAIN_VIEWS, ...main] as ViewDescriptor<MainViewId>[],
      mainBar: [...MAIN_BAR_VIEWS, ...main] as ViewDescriptor<MainViewId>[],
      side: [...SIDE_VIEWS, ...side],
      badges: Object.fromEntries(views.map((view) => [`ext:${view.key}`, view.badge])),
    }
  }, [data])
}

/**
 * Вид расширения пропал и не вернулся (расширение убрали или выключили): середина уходит на
 * вид Extensions, левая панель - на файлы. Перезагрузка после правки возвращает вид быстрее.
 */
export const useGoneViewFallback = (
  main: readonly { id: string }[],
  side: readonly { id: string }[],
) => {
  const mainId = useLayoutStore((state) => state.main.activeViewId)
  const sideId = useLayoutStore((state) => state.side.activeViewId)
  const mainGone = mainId.startsWith('ext:') && !main.some((view) => view.id === mainId)
  const sideGone = sideId.startsWith('ext:') && !side.some((view) => view.id === sideId)

  useEffect(() => {
    if (!mainGone && !sideGone) return

    const timer = setTimeout(() => {
      const layout = useLayoutStore.getState()

      if (mainGone) layout.showMainView('extensions')
      if (sideGone) layout.showSideView('files')
    }, GONE_MS)

    return () => clearTimeout(timer)
  }, [mainGone, sideGone])
}
