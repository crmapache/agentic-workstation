import type { ReactNode } from 'react'

export type SheetProps = {
  open: boolean
  /** Заголовок экрана капсом. */
  title: string
  /**
   * Пояснение экрана - кнопка «?» (HelpButton) перед крестиком: что это и как работает
   * лежит за ней, а не абзацем на экране.
   */
  help?: ReactNode | undefined
  /** Есть - в шапке стрелка назад, а Esc делает шаг назад вместо закрытия. */
  onBack?: (() => void) | undefined
  onClose: () => void
  backLabel: string
  closeLabel: string
  /**
   * Ключ экрана внутри листа. Прокрутка запоминается по нему, пока лист открыт, и
   * возвращается, когда на экран пришли шагом назад (restoreScroll).
   */
  screenKey: string
  restoreScroll?: boolean | undefined
  /** Прибито к низу листа: имя и версия. */
  footer?: ReactNode | undefined
  children: ReactNode
}
