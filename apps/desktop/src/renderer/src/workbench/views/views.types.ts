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
  /** Подпись ключом i18n - у видов IDE. */
  labelKey?: ParseKeys | undefined
  /** Подпись готовой строкой - у видов расширений (ADR 0091): их имена приходят от расширения. */
  label?: string | undefined
  /** Слова, по которым вид находит поиск везде, кроме его имени (gmail - коннекторы). */
  keywords?: string[]
  Component: LazyExoticComponent<ComponentType>
}
