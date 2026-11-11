import type { BrowserWindow } from 'electron'

import type { ClaudeState } from '@shared/claude'
import type { FeedPatch } from '@shared/claude-feed'
import { SECOND_MS } from '@shared/time-units'

import type { ClaudeService } from './claude/claude-service'
import type { RemoteService } from './remote/remote-service'
import { startRemote } from './remote/remote-setup'
import type { ScenarioService } from './scenarios/scenario-service'
import type { ScenarioTaps } from './scenarios/scenarios-setup'
import { startScenarios } from './scenarios/scenarios-setup'
import type { Statistics } from './statistics/statistics-wiring'
import { startStatistics } from './statistics/statistics-wiring'
import type { WorkspaceService } from './workspace/workspace-service'

/** Сколько выход из IDE ждёт возможности IDE поверх провайдеров. */
const FEATURES_SHUTDOWN_MAX_MS = 10 * SECOND_MS

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const warnShutdown = (error: unknown) =>
  console.warn('[app] возможность IDE не остановилась:', error)

export type IdeFeatures = {
  scenarios: ScenarioService
  statistics: Statistics
  remote: RemoteService
  /** Состояние панели Claude поменялось: статистике и Remote Control. */
  observeClaude: (state: ClaudeState) => void
  /** Живая заплатка ленты разговора: Remote Control (телефонам, которые смотрят разговор). */
  observeFeed: (patch: FeedPatch) => void
  /** Проекты открыли или закрыли. */
  projectsChanged: () => void
  /** Выход из IDE: связь с телефонами гаснет, прогоны пишутся остановленными, база закрывается. */
  shutdown: () => Promise<void>
}

/**
 * Возможности уровня IDE поверх провайдеров: сценарии (ADR 0039), статистика и Remote Control
 * (ADR 0041). Статистика слушает сценарии (итоги прогонов), Remote Control - сценарии и
 * разговоры, поэтому оба поднимаются после сценариев.
 */
export const startIdeFeatures = async (setup: {
  claude: ClaudeService
  workspace: WorkspaceService
  dataDir: string
  version: string
  getWindow: () => BrowserWindow | null
}): Promise<IdeFeatures> => {
  const { workspace, claude } = setup
  const taps: ScenarioTaps = { onQueues: () => undefined, onRun: () => undefined }
  const scenarios = await startScenarios({ ...setup, taps })
  const statistics = await startStatistics({ dataDir: setup.dataDir, scenarios, workspace })
  const remote = await startRemote({ ...setup, scenarios })

  taps.onQueues = () => remote.queuesChanged()
  taps.onRun = (run) => remote.runChanged(run)
  statistics.observeClaude(claude.getState())

  return {
    scenarios,
    statistics,
    remote,
    observeClaude: (state) => {
      statistics.observeClaude(state)
      remote.claudeChanged(state)
    },
    observeFeed: (patch) => remote.feedPatched(patch),
    projectsChanged: () => {
      statistics.projectsChanged()
      scenarios.projectsChanged(workspace.getState().projects.map((project) => project.rootPath))
      remote.workspaceChanged()
    },
    shutdown: async () => {
      // Порядок важен (связь, потом прогоны, потом база), но выход не ждёт дольше потолка:
      // постановка сценария в worktree тянется минутами, а ⌘Q и установка обновления - нет.
      // Сбой одного шага не должен оставить IDE незакрываемой.
      const steps = async () => {
        await remote.shutdown().catch(warnShutdown)
        await scenarios.shutdown().catch(warnShutdown)
        await statistics.stats.close().catch(warnShutdown)
      }

      await Promise.race([steps(), delay(FEATURES_SHUTDOWN_MAX_MS)])
    },
  }
}
