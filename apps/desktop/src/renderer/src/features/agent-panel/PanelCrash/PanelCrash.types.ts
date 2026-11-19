import type { ReactNode } from 'react'

export type PanelCrashProps = {
  /** «Reload the panel»: собрать панель заново (её данные живут в главном процессе). */
  onReload: () => void
  children: ReactNode
}

/** Чем упала отрисовка; пусто - не падала. */
export type PanelCrashState = { message: string }

export type CrashScreenProps = {
  message: string
  onReload: () => void
}
