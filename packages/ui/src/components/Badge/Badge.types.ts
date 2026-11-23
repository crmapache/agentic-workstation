import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

/** marker - точка тона и текст, для строк и таблиц; soft - тонированная плашка капсом. */
export type BadgeVariant = 'marker' | 'soft'

export type BadgeProps = {
  tone?: BadgeTone | undefined
  variant?: BadgeVariant | undefined
  /**
   * Значок перед текстом: о чём метка (срок, приоритет, сценарий). У marker он встаёт на место
   * точки и берёт её цвет тона - точка рядом со значком ничего не добавляла бы.
   */
  icon?: LucideIcon | undefined
  /** Подпись значка для скринридера, когда он говорит своё (будильник - «запуск в срок»). */
  iconLabel?: string | undefined
  /** Короткое слово или число: «Active», «3», «ahead 2». */
  children: ReactNode
}
