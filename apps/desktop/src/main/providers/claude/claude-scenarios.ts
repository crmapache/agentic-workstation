import { join } from 'node:path'

import type { ScenarioProvider } from '../scenario-provider'
import type { ClaudeService } from '../../claude/claude-service'
import { askStructured } from '../../claude/structured-ask'
import { releaseHead } from '../../claude/history/released-heads'
import { claudeHome, transcriptDirs } from '../../claude/history/transcript-paths'
import { ScenarioAuthor } from '../../scenarios/author/scenario-author'
import { scenarioAccounts } from './claude-scenario-accounts'
import { claudeSessions } from './claude-sessions'

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
 * Claude Code как исполнитель сценариев: процессы `claude -p` движка сценариев (claude-sessions),
 * аккаунты панели с выручкой на лимите, имя очереди от haiku.
 */
export const claudeScenarioProvider = (
  claude: ClaudeService,
  dataDir: string,
): ScenarioProvider => {
  const sessions = claudeSessions(claude)
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
    prepare: sessions.prepare,
    spawn: sessions.spawn,
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
