import type { ScenarioCode } from '@shared/scenarios'

import type { ClaudeService } from '../../claude/claude-service'
import { scenarioArgs } from '../../scenarios/scenario-launch'
import type { ClaudeCli } from '../../claude/cli/cli-locator'
import { CliProcess } from '../../claude/cli/cli-process'
import { CLI_ENV_OVERRIDES } from '../../claude/cli/cli.constants'
import type {
  SessionSpec,
  SessionWires,
  SessionProcess,
} from '../../scenarios/engine/scenario-session'
import { scenarioEnv } from './claude-scenario-accounts'
import { DeferredProcess } from './deferred-process'

/** Где идёт процесс: папка (у очереди - её worktree) и проект, по которому даны коннекторы. */
export type SessionPlace = { cwd: string; projectPath: string }

export type ClaudeSessions = {
  /** CLI на месте и папке доверились; null - можно поднимать процессы. */
  prepare: (projectPath: string) => Promise<ScenarioCode | null>
  spawn: (spec: SessionSpec, place: SessionPlace, wires: SessionWires) => SessionProcess | null
}

/**
 * Процессы `claude -p` без вкладки - для голов и карточек сценариев и для прогонов заданий:
 * аккаунт из спецификации, коннекторы IDE по исходному проекту, поток JSON в обе стороны.
 * CLI ищется на каждом prepare - его могли поставить или обновить, пока IDE открыта; spawn
 * без prepare процесса не поднимет.
 */
export const claudeSessions = (claude: ClaudeService): ClaudeSessions => {
  let cli: ClaudeCli | null = null

  return {
    prepare: async (projectPath) => {
      cli = await claude.cli.locate()

      if (!cli) return 'noClaude'
      if (!(await claude.isTrusted(projectPath))) return 'untrusted'

      return null
    },
    spawn: (spec, place, wires) => {
      const located = cli
      const env = located && scenarioEnv(claude, spec.accountId, located.env)

      if (!located || !env) return null

      return new DeferredProcess(async (wanted) => {
        const connectors = await claude.connectors.configFor(place.projectPath).catch(() => null)

        // Сессия - свой разговор: процессы одной сессии делят вкладки браузера, а файлы с диска
        // инструменты берут только из её папки (worktree очереди).
        connectors?.own({ conversationId: spec.sessionId, workDir: place.cwd })

        // Сессию остановили, пока писался конфиг шлюза: CLI с хуками проекта не нужен вовсе.
        if (!wanted()) {
          connectors?.release()

          return null
        }

        try {
          return new CliProcess(
            {
              binary: located.binary,
              args: scenarioArgs(
                {
                  ...spec,
                  mcpConfig: connectors?.path ?? null,
                  allowedTools: connectors?.allowed,
                },
                located.features,
              ),
              cwd: place.cwd,
              env: { ...env, ...CLI_ENV_OVERRIDES },
            },
            {
              onMessage: (message) => {
                // Ход кончился: курсор агента в Chrome и капсула Computer не ждут конца сессии.
                if (message.type === 'result') connectors?.idle()

                wires.onMessage(message)
              },
              onControlRequest: wires.onControlRequest,
              onExit: (code, stderrTail) => {
                connectors?.release()
                wires.onExit(code, stderrTail)
              },
            },
          )
        } catch (error) {
          connectors?.release()
          throw error
        }
      }, wires)
    },
  }
}
