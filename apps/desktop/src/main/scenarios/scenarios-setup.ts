import { homedir } from 'node:os'
import { join } from 'node:path'

import type { BrowserWindow } from 'electron'
import { Notification, powerMonitor } from 'electron'

import type { ProviderId } from '@shared/providers'
import type { ScenarioRun } from '@shared/scenario-runs'

import { broadcast } from '../ipc/broadcast'
import type { ScenarioProvider } from '../providers/scenario-provider'
import type { WorkspaceService } from '../workspace/workspace-service'
import { loadReleasedHeads } from '../agents/history/released-runs'
import { ScenarioService } from './scenario-service'

/** Worktree очередей - вне проектов и без пробелов в пути (решение владельца, ADR 0039). */
export const WORKTREES_ROOT = join(homedir(), '.agentic-workstation', 'worktrees')

/**
 * Кто ещё слушает очереди и прогоны, кроме окна (Remote Control): ставится позже, когда
 * слушатель поднят, - поля меняются на месте.
 */
export type ScenarioTaps = {
  onQueues: () => void
  onRun: (run: ScenarioRun) => void
}

export type ScenariosSetup = {
  /** Исполнители провайдеров (run-providers.ts): прогон идёт на провайдере элемента очереди. */
  providers: readonly ScenarioProvider[]
  /** Провайдер служебной работы (Settings → AI): имена очередей и черновики сценариев. */
  service: () => ProviderId
  workspace: WorkspaceService
  dataDir: string
  getWindow: () => BrowserWindow | null
  /** Все звуки IDE выключены (кнопка в строке состояния): уведомление ОС - без своего звука. */
  silent: () => boolean
  taps?: ScenarioTaps | undefined
}

/**
 * Сценарии на уровне IDE (ADR 0039) - сервис, его провайдеры и связь с окном. Уведомление ОС
 * зовёт человека, когда прогон кончился, встал на вопросе или очередь остановилась; клик по
 * нему поднимает окно.
 */
export const startScenarios = async (setup: ScenariosSetup): Promise<ScenarioService> => {
  const { workspace, getWindow } = setup
  const notify = (title: string, body: string) => {
    if (!Notification.isSupported()) return

    const note = new Notification({ title, body, silent: setup.silent() })

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
    providers: setup.providers,
    service: setup.service,
    events: {
      onQueues: (view) => {
        broadcast('scenarios:queues', view)
        setup.taps?.onQueues()
      },
      onShelves: (projectPath, view) => broadcast('scenarios:shelves', { projectPath, view }),
      onRun: (projectPath, run) => {
        broadcast('scenarios:run', { projectPath, run })
        setup.taps?.onRun(run)
      },
      notify,
      openProject: (path) => void workspace.openProject(path),
    },
  })

  service.projectsChanged(workspace.getState().projects.map((project) => project.rootPath))
  powerMonitor.on('resume', () => service.awake())

  return service
}
