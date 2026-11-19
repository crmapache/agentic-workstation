import { use, createContext } from 'react'

import type { SurfaceApi } from './ExtensionSurface.types'

/** Поверхность вида расширения для узлов дерева: значения полей и события. */
export const SurfaceContext = createContext<SurfaceApi | null>(null)

/** Узел вне поверхности не рисуется - это ошибка раскладки, а не данных расширения. */
export const useSurface = (): SurfaceApi => {
  const surface = use(SurfaceContext)

  if (!surface) throw new Error('Extension node outside its surface')

  return surface
}
