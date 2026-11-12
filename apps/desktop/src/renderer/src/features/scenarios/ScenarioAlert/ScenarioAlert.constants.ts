import type { LucideIcon } from 'lucide-react'
import { CircleAlert, TriangleAlert } from 'lucide-react'

import type { ScenarioAlertTone } from './ScenarioAlert.types'

/** Знак у строки - ростом с её мелкий текст. */
export const ALERT_ICON_SIZE = 14

/** Знак тона: отказ - круг, предупреждение - треугольник, как у находок редактора. */
export const ALERT_ICONS: Record<ScenarioAlertTone, LucideIcon> = {
  warning: TriangleAlert,
  danger: CircleAlert,
}
