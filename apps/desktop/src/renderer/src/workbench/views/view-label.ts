import type { TFunction } from 'i18next'

import type { ViewDescriptor } from './views.types'

/** Подпись вида: строкой от расширения или переводом своего ключа. */
export const viewLabel = <ViewId extends string>(
  view: ViewDescriptor<ViewId>,
  t: TFunction,
): string => view.label ?? (view.labelKey ? t(view.labelKey) : view.id)
