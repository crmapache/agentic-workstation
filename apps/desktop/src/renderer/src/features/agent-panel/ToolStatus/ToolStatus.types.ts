import type { ToolMeta } from '../tool-summary.utils'

export type ToolStatusProps = {
  meta: ToolMeta
  /** Вызов идёт. */
  running: boolean
  /** Вызов идёт и стоит на разрешении человека - «waiting for you» у самого вызова. */
  awaiting: boolean
}
