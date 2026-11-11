import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

/** Значение строки корня меню: слово или число справа и, если это состояние, его тон. */
export type MenuRowValue = { text: string; tone?: BadgeTone | undefined }

/** Что строки корня меню говорят, не открывая экран. */
export type MenuSummary = {
  history: MenuRowValue | null
  plugins: MenuRowValue | null
  accounts: MenuRowValue | null
}
