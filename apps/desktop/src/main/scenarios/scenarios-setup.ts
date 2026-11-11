import { homedir } from 'node:os'
import { join } from 'node:path'

import type { BrowserWindow } from 'electron'
import { Notification } from 'electron'

import type { ClaudeService } from '../claude/claude-service'
import { broadcast } from '../ipc/broadcast'
import type { WorkspaceService } from '../workspace/workspace-service'
import { loadReleasedHeads } from '../claude/history/released-heads'
import { claudeScenarioProvider } from '../providers/claude/claude-scenarios'
import { ScenarioService } from './scenario-service'

/** Worktree очередей - вне проектов и без пробелов в пути (решение владельца, ADR 0039). */
export const WORKTREES_ROOT = join(homedir(), '.agentic-workstation', 'worktrees')

export type ScenariosSetup = {
  claude: ClaudeService
  workspace: WorkspaceService
  dataDir: string
  getWindow: () => BrowserWindow | null
}

/**
 * Сценарии на уровне IDE (ADR 0039) - сервис, его провайдеры и связь с окном. Уведомление ОС
 * зовёт человека, когда прогон кончился, встал на вопросе или очередь остановилась; клик по
 * нему поднимает окно.
 */
export const startScenarios = async (setup: ScenariosSetup): Promise<ScenarioService> => {
  const { claude, workspace, getWindow } = setup
  const notify = (title: string, body: string) => {
    if (!Notification.isSupported()) return

    const note = new Notification({ title, body })

    note.on('click', () => {
      const window = getWindow()

      if (window?.isMinimized()) window.restore()
      window?.focus()
    })
    note.show()
  }
  await loadReleasedHeads(join(setup.dataDir, 'scenario-released.json'))

  const service = await ScenarioService.load({
    dataDir: setup.dataDir,
    worktreesRoot: WORKTREES_ROOT,
    providers: [claudeScenarioProvider(claude, setup.dataDir)],
    events: {
      onQueues: (view) => broadcast('scenarios:queues', view),
      onShelves: (projectPath, view) => broadcast('scenarios:shelves', { projectPath, view }),
      onRun: (projectPath, run) => broadcast('scenarios:run', { projectPath, run }),
      notify,
      openProject: (path) => void workspace.openProject(path),
    },
  })

  service.projectsChanged(workspace.getState().projects.map((project) => project.rootPath))

  return service
}
