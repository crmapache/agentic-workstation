import type { RingMeterTone } from '@agentic-workstation/ui/RingMeter.types'

/**
 * По показанию на каждую ступень лестницы - с тех процентов, где ступени и начинаются:
 * на полном цвете четыре кольца стоят зелёным, жёлтым, оранжевым и красным, как под
 * полем; ползунок вниз - тянутся к одному тону вместе.
 */
export const CALM_LADDER: readonly { value: number; tone: RingMeterTone }[] = [
  { value: 12, tone: 'success' },
  { value: 58, tone: 'warning' },
  { value: 78, tone: 'high' },
  { value: 94, tone: 'danger' },
]

/**
 * Сколько израсходовано в образце полосы окна лимита (экран аккаунтов): ради такой полосы
 * режим и просят - на полном цвете она красная.
 */
export const CALM_BAR_PERCENT = 94
