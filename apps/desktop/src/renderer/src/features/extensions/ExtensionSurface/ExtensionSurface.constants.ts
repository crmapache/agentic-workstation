import type { UiTone } from '@shared/extension-ui'

import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'
import type { ChartTone } from '@agentic-workstation/ui/ChartTip.types'

/** Тон узла расширения - тон плашки дизайн-системы: смысл цветов тот же. */
export const BADGE_TONES: Record<UiTone, BadgeTone> = {
  default: 'neutral',
  muted: 'neutral',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
}

/** Ряды графика по порядку - тона графиков IDE. */
export const CHART_TONES: readonly ChartTone[] = ['chart1', 'chart2', 'chart3', 'chart4']

/** Сколько ждать тишины в поле, прежде чем сказать расширению о правке. */
export const CHANGE_QUIET_MS = 400
