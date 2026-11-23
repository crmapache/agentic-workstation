import type { ClaudeService } from '../claude/claude-service'
import { panelsPort } from '../remote/panel-ports'
import { scenariosPort } from '../remote/remote-setup'
import type { ScenarioService } from '../scenarios/scenario-service'
import type { TaskService } from '../tasks/task-service'
import type { TrackerRuntime } from '../tracker/tracker-setup'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { PanelRegistry } from '../agents/panel/panel-registry'
import type { ExtensionsPort, WorkstationPorts } from './workstation-link'

/**
 * Порты самой IDE для её коннектора (ADR 0090): проекты, сценарии, задания, трекер и панели -
 * теми же публичными методами, что у окна и у телефона Remote Control.
 */
export const workstationPorts = (setup: {
  workspace: WorkspaceService
  scenarios: ScenarioService
  tasks: TaskService
  /** Трекер задач (ADR 0101): поднят раньше портов, вместе со сценариями. */
  tracker: Pick<TrackerRuntime, 'tracker' | 'runs'>
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
    tracker: {
      board: (place) => setup.tracker.tracker.board(place),
      apply: (place, op) => setup.tracker.tracker.apply(place, op),
      send: (place, request) => setup.tracker.runs.send(place, request),
      pathsOf: (id) => setup.tracker.tracker.pathsOf(id),
    },
    panels: () => panels.list(),
    extensions: setup.extensions,
  }
}
