import { useTranslation } from 'react-i18next'

import { useScenarioQueues } from '../../state/scenarios.queries'
import { useTasks } from '../../state/tasks.queries'
import { useAllConversations } from '../../features/agent-panel/panel.queries'
import { tabName } from '../../features/agent-panel/ConversationTabs/ConversationTabs.utils'
import type { ProjectWork } from '../../features/projects/ProjectTab/ProjectTab.types'
import { taskWork, projectWork } from './project-work.utils'

/**
 * Что работает само в каждом проекте - знак работы на вкладках проектов: разговоры панелей
 * провайдеров всех проектов (и фоновых), идущие прогоны сценариев и заданий по расписанию. Источники главный
 * процесс держит свежими событиями (agent:state, scenarios:queues, tasks:changed), так что знак
 * гаснет вместе с работой.
 */
export const useProjectWork = (): ((rootPath: string) => readonly ProjectWork[]) => {
  const { t } = useTranslation()
  const conversations = useAllConversations()
  const runs = useScenarioQueues().data?.live ?? []
  const taskRuns = useTasks().data?.runs ?? []

  return (rootPath) => [
    ...projectWork(conversations, runs, rootPath, {
      chat: (conversation) => t('projects.work.chat', { name: tabName(conversation, t) }),
      run: (run) => t('projects.work.scenario', { name: run.scenarioName }),
    }),
    ...taskWork(taskRuns, rootPath, (run) => t('projects.work.task', { name: run.taskName })),
  ]
}
