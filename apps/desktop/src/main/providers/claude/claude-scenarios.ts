import { join } from 'node:path'

import type { ScenarioProvider } from '../scenario-provider'
import type { ClaudeService } from '../../claude/claude-service'
import { askStructured } from '../../claude/structured-ask'
import { scenarioArgs } from '../../scenarios/scenario-launch'
import type { ClaudeCli } from '../../claude/cli/cli-locator'
import { CliProcess } from '../../claude/cli/cli-process'
import { CLI_ENV_OVERRIDES } from '../../claude/cli/cli.constants'
import { releaseHead } from '../../claude/history/released-heads'
import { claudeHome, transcriptDirs } from '../../claude/history/transcript-paths'
import { ScenarioAuthor } from '../../scenarios/author/scenario-author'
import { scenarioEnv, scenarioAccounts } from './claude-scenario-accounts'
import { DeferredProcess } from './deferred-process'

/** Имя очереди - короткий ответ дешёвой модели; дольше минуты ждать нечего. */
const TITLE_MS = 60_000
const TITLE_SCHEMA = {
  type: 'object',
  properties: { title: { type: 'string' } },
  required: ['title'],
}

const titlePrompt = (description: string) =>
  [
    'Give a short name (2 to 5 words, no quotes, no trailing period) to this piece of work,',
    'so a person can tell it apart from other running work at a glance. Answer in the language',
    'of the work description.',
    '',
    description,
  ].join('\n')

/**
 * Claude Code как исполнитель сценариев: процессы `claude -p` движка сценариев, аккаунты
 * панели с выручкой на лимите, коннекторы IDE по исходному проекту, имя очереди от haiku.
 * CLI ищется на каждом prepare - его могли поставить или обновить, пока IDE открыта.
 */
export const claudeScenarioProvider = (
  claude: ClaudeService,
  dataDir: string,
): ScenarioProvider => {
  let cli: ClaudeCli | null = null
  const defaults = () => {
    const prefs = claude.panel.newTabPrefs(claude.settings.prefs)

    return { model: prefs.newTabModel ?? '', effort: prefs.newTabEffort ?? '' }
  }
  // Сценарий пишет и оплачивает выбранный аккаунт - тот, на ком он потом пойдёт.
  const author = new ScenarioAuthor({
    cli: async () => {
      const located = await claude.cli.locate()

      return located && { ...located, env: claude.accounts.envFor(located.env) }
    },
    home: claudeHome,
    isTrusted: (path) => claude.isTrusted(path),
    defaults,
  })

  return {
    id: 'claude',
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
                { ...spec, mcpConfig: connectors?.path ?? null },
                located.features,
              ),
              cwd: place.cwd,
              env: { ...env, ...CLI_ENV_OVERRIDES },
            },
            {
              onMessage: wires.onMessage,
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
    transcriptDirs: (cwd) => transcriptDirs(cwd).catch(() => []),
    defaults,
    accounts: scenarioAccounts(claude),
    suggestTitle: async (description) => {
      const located = await claude.cli.locate()

      if (!located) return null

      const result = await askStructured(
        { ...located, env: claude.accounts.envFor(located.env) },
        {
          prompt: titlePrompt(description),
          schema: TITLE_SCHEMA,
          tools: [],
          model: 'haiku',
          // Своя пустая папка: без хуков и CLAUDE.md чужого проекта.
          cwd: join(dataDir, 'scenario-titles'),
          timeoutMs: TITLE_MS,
          signal: AbortSignal.timeout(TITLE_MS),
        },
      )

      if (!('output' in result)) return null

      const title = (result.output as { title?: unknown }).title

      return typeof title === 'string' && title.trim() ? title.trim() : null
    },
    draft: (projectPath, draftId, description, scope) =>
      author.draft(projectPath, draftId, description, scope),
    cancelDraft: (draftId) => author.cancel(draftId),
    openChat: async (cwd, sessionId) => {
      releaseHead(sessionId)

      return claude
        .openHistory(cwd, sessionId)
        .then(() => true)
        .catch(() => false)
    },
  }
}
