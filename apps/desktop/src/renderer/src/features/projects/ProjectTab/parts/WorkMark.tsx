import { Spinner } from '@agentic-workstation/ui/Spinner'

import type { WorkMarkProps } from '../ProjectTab.types'

/**
 * Знак «в проекте идёт работа»: спиннер тоном «работает сам» - янтарный, как точка работающего
 * разговора, а оранжевый у маячков справа значит «ждёт тебя». sm - слева от имени проекта,
 * around - кольцом вокруг знака дома. Для скринридера - что именно работает.
 */
export const WorkMark = ({ work, size }: WorkMarkProps) => (
  <Spinner size={size} tone="warning" label={work.map((item) => item.text).join('; ')} />
)
