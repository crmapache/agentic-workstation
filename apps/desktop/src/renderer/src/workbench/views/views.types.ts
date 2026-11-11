import type { ComponentType, LazyExoticComponent } from 'react'
import type { ParseKeys } from 'i18next'
import type { LucideIcon } from 'lucide-react'

/**
 * Вид, который можно показать в боковой панели: иконка в полосе переключения и
 * компонент, который грузится при первом показе.
 */
export type ViewDescriptor<ViewId extends string> = {
  id: ViewId
  icon: LucideIcon
  labelKey: ParseKeys
  /** Слова, по которым вид находит поиск везде, кроме его имени (gmail - коннекторы). */
  keywords?: string[]
  Component: LazyExoticComponent<ComponentType>
}
