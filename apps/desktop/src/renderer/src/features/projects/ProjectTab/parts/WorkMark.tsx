import { Spinner } from '@agentic-workstation/ui/Spinner'

import type { WorkMarkProps } from '../ProjectTab.types'

/**
 * Знак «в проекте идёт работа»: спиннер тоном «работает сам» - янтарный, как точка работающего
 * разговора, а оранжевый у маячков справа значит «ждёт тебя». Идёт только фоновая автоматика
 * (сценарии, задания), а чат молчит - кольцо из шагов с бегущим огоньком вместо дуги (ADR 0097).
 * Один размер везде: слева от имени проекта и на месте знака дома. Для скринридера - что именно
 * работает.
 */
export const WorkMark = ({ work }: WorkMarkProps) => (
  <Spinner
    size="sm"
    tone="warning"
    variant={work.every((item) => item.background) ? 'steps' : 'arc'}
    label={work.map((item) => item.text).join('; ')}
  />
)
