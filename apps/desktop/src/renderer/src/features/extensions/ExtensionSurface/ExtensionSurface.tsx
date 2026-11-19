import { useExtensionViewTrees } from '../../../state/extensions.queries'
import { SurfaceContext } from './ExtensionSurface.context'
import { useSurfaceApi } from './ExtensionSurface.hooks'
import styles from './ExtensionSurface.module.scss'
import type { ExtensionSurfaceProps } from './ExtensionSurface.types'
import { SurfaceNode } from './parts/SurfaceNode'

/**
 * Содержимое вида расширения (ADR 0091): дерево узлов, которое прислало расширение, нашими
 * примитивами. Своего HTML у расширения нет - поэтому оно не ломает раскладку и стиль IDE.
 */
export const ExtensionSurface = ({ viewKey }: ExtensionSurfaceProps) => {
  const { data: trees } = useExtensionViewTrees()
  const tree = trees?.[viewKey]?.tree ?? null
  const surface = useSurfaceApi(viewKey, tree)

  if (!tree) return null

  return (
    <SurfaceContext value={surface}>
      <div className={styles.surface}>
        <SurfaceNode node={tree} />
      </div>
    </SurfaceContext>
  )
}
