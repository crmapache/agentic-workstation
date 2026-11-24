import type { BarGroup } from '../../state/bar-buttons.types'
import type { ViewDescriptor } from './views.types'

/** Виды одной группы полосы по их порядку: вид без своей группы стоит сверху. */
export const viewsOfGroup = <ViewId extends string>(
  views: readonly ViewDescriptor<ViewId>[],
  group: BarGroup,
): ViewDescriptor<ViewId>[] => views.filter((view) => (view.group ?? 'top') === group)
