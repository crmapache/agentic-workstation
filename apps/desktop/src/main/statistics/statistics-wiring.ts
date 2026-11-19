import { sep } from 'node:path'

import type { AgentPanelState } from '@shared/conversation'
import type { ProviderId } from '@shared/providers'
import type { ScenarioRun } from '@shared/scenario-runs'

import { broadcast } from '../ipc/broadcast'
import type { ScenarioService } from '../scenarios/scenario-service'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { StatsService } from './stats-service'
import { createStatsService } from './stats-setup'
import { nearestGitRoot } from './places/git-root'

export type StatisticsSetup = {
  /**
   * Разговор сессии движка у провайдера (поток Codex, сессия OpenCode): статистика знает
   * разговоры по их собственным id. Нет - id движка и есть разговор (Claude Code).
   */
  chatIdOf?: ((provider: ProviderId, sessionId: string) => Promise<string | null>) | undefined
  dataDir: string
  scenarios: ScenarioService
  workspace: WorkspaceService
}

export type Statistics = {
  stats: StatsService
  /**
   * Состояние панели провайдера (у всех панелей форма одна): её разговоры - «в IDE», конец
   * работы - точное время агента. sessionId разговора - id самого провайдера (сессия Claude,
   * поток Codex, `ses_` OpenCode): по нему запись сходится с журналом провайдера.
   */
  observe: (provider: ProviderId, state: AgentPanelState) => void
  /** Проекты открыли или закрыли: папки журналов пересчитываются по проектам. */
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
 * Статистика (docs/workplan/20-statistics.md): сервис с базой и потоком чтения журналов
 * провайдеров, плюс живые события IDE, которых в журналах нет. Проект папки журнала: worktree
 * очереди - её исходный проект, папка внутри открытого или недавнего проекта - он, иначе
 * ближайший .git.
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
  /** Отмеченные разговоры и идущая работа - по провайдеру: id у панелей свои. */
  const seenSessions = new Set<string>()
  /** Работа разговора, пока она идёт: начало, простой на вопросах и сессия на последнем снимке. */
  const working = new Map<string, { startedAt: number; pausedMs: number; session: string }>()

  await stats.start(projectOf)

  const observe = (provider: ProviderId, state: AgentPanelState) => {
    const now = Date.now()

    for (const conversation of state.conversations) {
      const { id, sessionId, projectPath, workStartedAt, workPausedMs } = conversation
      const key = `${provider}\n${id}`
      const seen = `${provider}\n${sessionId}`

      // Разговор Codex и OpenCode получает id провайдера с первым ходом: до него отмечать нечего.
      if (sessionId && !seenSessions.has(seen)) {
        seenSessions.add(seen)
        stats.noteIdeSession(provider, sessionId, 'panel')
      }

      const was = working.get(key)

      if (workStartedAt !== null) {
        working.set(key, { startedAt: workStartedAt, pausedMs: workPausedMs, session: sessionId })
      } else if (was) {
        working.delete(key)

        const session = sessionId || was.session

        if (!session) continue

        stats.noteTurn({
          provider,
          session,
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
      if (!session) continue

      void (setup.chatIdOf?.(run.provider, session) ?? Promise.resolve(session)).then((chatId) => {
        if (chatId) stats.noteIdeSession(run.provider, chatId, 'scenario')
      })
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

  return { stats, observe, projectsChanged }
}
