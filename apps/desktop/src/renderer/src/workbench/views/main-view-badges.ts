import { inboxCount } from '@shared/inbox'

import { useExtensions } from '../../state/extensions.queries'
import { useInbox } from '../../state/inbox.queries'
import type { MainViewId } from '../../state/layout.types'
import { askingCount, useScenarioQueues } from '../../state/scenarios.queries'
import { useTasks, waitingCount } from '../../state/tasks.queries'
import { useActiveProject } from '../../state/workspace.queries'

/**
 * Числа на иконках видов середины - то, что ждёт человека: прогоны сценариев и заданий с
 * вопросом, непрочитанные и ждущие ответа уведомления, расширения, ждущие одобрения прав. Видно, даже когда открыт другой вид
 * (ADR 0039, 0069).
 */
export const useMainViewBadges = (): Partial<Record<MainViewId, number>> => {
  const { data: queues } = useScenarioQueues()
  const { data: tasks } = useTasks()
  const { data: inbox } = useInbox()
  const { data: extensions } = useExtensions()
  const project = useActiveProject()

  return {
    scenarios: askingCount(queues, project?.rootPath),
    tasks: waitingCount(tasks, project?.rootPath),
    inbox: inbox ? inboxCount(inbox) : 0,
    // Расширения, которые просят прав (ADR 0091): без человека они не запустятся.
    extensions:
      extensions?.extensions.filter((item) => item.status === 'needsApproval').length ?? 0,
  }
}
