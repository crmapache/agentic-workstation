import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import type { UiNode, UiValues } from '@shared/extension-ui'

export type ExtensionSurfaceProps = {
  /** Ключ вида `<расширение>.<вид>`: по нему дерево в кэше и события в главный процесс. */
  viewKey: string
}

/** Что узлам дерева нужно от поверхности: значения полей и отправка событий расширению. */
export type SurfaceApi = {
  values: UiValues
  setValue: (name: string, value: string | boolean) => void
  act: (action: string) => void
}

/** Узел определённого вида: детали рисования берут только свои поля. */
export type NodeOf<T extends UiNode['type']> = Extract<UiNode, { type: T }>

export type NodeProps<T extends UiNode['type']> = { node: NodeOf<T> }

export type ListRowBodyProps = {
  icon: LucideIcon | null
  title: string
  description: string | undefined
  badge: ReactNode
}
