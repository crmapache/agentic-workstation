import type { BrowserWindow } from 'electron'

import type { ClaudeService } from './claude/claude-service'
import type { ScenarioService } from './scenarios/scenario-service'
import { startScenarios } from './scenarios/scenarios-setup'
import type { Statistics } from './statistics/statistics-wiring'
import { startStatistics } from './statistics/statistics-wiring'
import type { WorkspaceService } from './workspace/workspace-service'

export type IdeFeatures = {
  scenarios: ScenarioService
  statistics: Statistics
  /** Проекты открыли или закрыли. */
  projectsChanged: () => void
  /** Выход из IDE: прогоны пишутся остановленными, база статистики закрывается. */
  shutdown: () => Promise<void>
}

/**
 * Возможности уровня IDE поверх провайдеров: сценарии (ADR 0039) и статистика. Статистика
 * слушает сценарии (итоги прогонов), поэтому поднимается второй.
 */
export const startIdeFeatures = async (setup: {
  claude: ClaudeService
  workspace: WorkspaceService
  dataDir: string
  getWindow: () => BrowserWindow | null
}): Promise<IdeFeatures> => {
  const { workspace } = setup
  const scenarios = await startScenarios(setup)
  const statistics = await startStatistics({ dataDir: setup.dataDir, scenarios, workspace })

  statistics.observeClaude(setup.claude.getState())

  return {
    scenarios,
    statistics,
    projectsChanged: () => {
      statistics.projectsChanged()
      scenarios.projectsChanged(workspace.getState().projects.map((project) => project.rootPath))
    },
    shutdown: async () => {
      await scenarios.shutdown()
      await statistics.stats.close()
    },
  }
}
