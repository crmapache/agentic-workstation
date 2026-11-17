import { Spinner } from '@agentic-workstation/ui/Spinner'

import type { WorkMarkProps } from '../ProjectTab.types'

/**
 * Знак «в проекте идёт работа»: спиннер тоном «работает сам» - янтарный, как точка работающего
 * разговора, а оранжевый у маячков справа значит «ждёт тебя». Один размер везде: слева от имени
 * проекта и на месте знака дома. Для скринридера - что именно работает.
 */
export const WorkMark = ({ work }: WorkMarkProps) => (
  <Spinner size="sm" tone="warning" label={work.map((item) => item.text).join('; ')} />
)
