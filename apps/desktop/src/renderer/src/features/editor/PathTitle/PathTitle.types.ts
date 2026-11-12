import type { ReactNode } from 'react'

import type { GitChange } from '@shared/git'

export type PathTitleProps = {
  /** Путь от корня проекта; у истории всего проекта - имя проекта. */
  path: string
  kind: 'file' | 'folder'
  /** Имя цветом вида изменения, как в дереве и списке изменений; нет - обычным цветом. */
  tone?: GitChange['kind'] | null | undefined
  /** Что ещё сказать после пути (откуда переименован). */
  children?: ReactNode
}
