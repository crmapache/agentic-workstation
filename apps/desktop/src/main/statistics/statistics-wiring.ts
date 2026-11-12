import { sep } from 'node:path'

import type { ClaudeState } from '@shared/claude'
import type { ScenarioRun } from '@shared/scenario-runs'

import { broadcast } from '../ipc/broadcast'
import type { ScenarioService } from '../scenarios/scenario-service'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { StatsService } from './stats-service'
import { createStatsService } from './stats-setup'
import { nearestGitRoot } from './places/git-root'

export type StatisticsSetup = {
  dataDir: string
  scenarios: ScenarioService
  workspace: WorkspaceService
}

export type Statistics = {
  stats: StatsService
  /** Состояние панели Claude: её разговоры - «в IDE», конец работы - точное время агента. */
  observeClaude: (state: ClaudeState) => void
  /** Проекты открыли или закрыли: папки транскриптов пересчитываются по проектам. */
  projectsChanged: () => void
}

/**
 * Самая длинная папка проекта, внутри которой лежит path; null - ни в одной. Черта - системы:
 * на Windows папка разговора в транскрипте - `C:\repo\sub`.
 */
const insideOf = (roots: readonly string[], path: string): string | null =>
  roots
    .filter((root) => path === root || path.startsWith(`${root}${sep}`))
    .sort((left, right) => right.length - left.length)[0] ?? null

/**
 * Статистика (docs/workplan/20-statistics.md): сервис с базой и потоком чтения транскриптов, плюс
 * живые события IDE, которых в транскриптах нет. Проект папки транскрипта: worktree очереди -
 * её исходный проект, папка внутри открытого или недавнего проекта - он, иначе ближайший .git.
 */
export const startStatistics = async (setup: StatisticsSetup): Promise<Statistics> => {
  const { scenarios, workspace } = setup
  const stats = createStatsService({
    dataDir: setup.dataDir,
    onChanged: () => broadcast('stats:changed', stats.progress),
  })
  const gitRoot = nearestGitRoot()
  const projectOf = async (cwd: string) => {
    const state = workspace.getState()
    const roots = [...state.projects, ...state.recentProjects].map((project) => project.rootPath)

    return scenarios.originOf(cwd) ?? insideOf(roots, cwd) ?? (await gitRoot(cwd))
  }
  const seenSessions = new Set<string>()
  /** Работа разговора, пока она идёт: начало и простой на вопросах на последнем снимке. */
  const working = new Map<string, { startedAt: number; pausedMs: number }>()

  await stats.start(projectOf)

  const observeClaude = (state: ClaudeState) => {
    const now = Date.now()

    for (const conversation of state.conversations) {
      const { id, sessionId, projectPath, workStartedAt, workPausedMs } = conversation

      if (!seenSessions.has(sessionId)) {
        seenSessions.add(sessionId)
        stats.noteIdeSession('claude', sessionId, 'panel')
      }

      const was = working.get(id)

      if (workStartedAt !== null) {
        working.set(id, { startedAt: workStartedAt, pausedMs: workPausedMs })
      } else if (was) {
        working.delete(id)
        stats.noteTurn({
          provider: 'claude',
          session: sessionId,
          project: projectPath,
          startedAt: was.startedAt,
          endedAt: now,
          workMs: Math.max(0, now - was.startedAt - was.pausedMs),
        })
      }
    }
  }

  scenarios.onRunFinished = (run: ScenarioRun) => {
    for (const session of [
      run.headConversationId,
      ...run.steps.map((step) => step.conversationId),
    ]) {
      if (session) stats.noteIdeSession(run.provider, session, 'scenario')
    }

    stats.noteScenarioRun({
      runId: run.id,
      provider: run.provider,
      project: run.projectPath,
      scenario: run.scenarioName,
      startedAt: run.startedAt,
      endedAt: run.finishedAt || Date.now(),
      state: run.state,
      cost: run.cost,
      tokens: run.tokens,
      activeMs: Math.max(0, (run.finishedAt || Date.now()) - run.startedAt - run.idle - run.rested),
    })
  }

  // База не открылась или поток упал - смена проектов не должна ронять главный процесс.
  const projectsChanged = () =>
    void stats.refreshProjects(projectOf).catch((error: unknown) => {
      console.warn('[statistics] projects were not refreshed', error)
    })

  return { stats, observeClaude, projectsChanged }
}
