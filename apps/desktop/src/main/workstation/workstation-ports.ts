import type { ClaudeService } from '../claude/claude-service'
import { panelsPort } from '../remote/panel-ports'
import { scenariosPort } from '../remote/remote-setup'
import type { ScenarioService } from '../scenarios/scenario-service'
import type { TaskService } from '../tasks/task-service'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { PanelRegistry } from '../agents/panel/panel-registry'
import type { ExtensionsPort, WorkstationPorts } from './workstation-link'

/**
 * Порты самой IDE для её коннектора (ADR 0090): проекты, сценарии, задания и панели - теми же
 * публичными методами, что у окна и у телефона Remote Control.
 */
export const workstationPorts = (setup: {
  workspace: WorkspaceService
  scenarios: ScenarioService
  tasks: TaskService
  claude: ClaudeService
  panels: PanelRegistry
  /** Расширения IDE: поднимаются позже портов (ADR 0091), до того - null. */
  extensions: () => ExtensionsPort | null
}): WorkstationPorts => {
  const panels = panelsPort(setup.claude, setup.panels)

  return {
    projects: {
      state: () => setup.workspace.getState(),
      open: (rootPath) => setup.workspace.openProject(rootPath),
    },
    scenarios: scenariosPort(setup.scenarios),
    tasks: setup.tasks,
    panels: () => panels.list(),
    extensions: setup.extensions,
  }
}
