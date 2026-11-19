import { join } from 'node:path'

import type { ScenarioProvider } from '../scenario-provider'
import { titleOf, TITLE_MS, titlePrompt, TITLE_SCHEMA } from '../scenario-titles'
import type { ClaudeService } from '../../claude/claude-service'
import { askStructured } from '../../claude/structured-ask'
import { releaseHead } from '../../agents/history/released-runs'
import { makeThumbnail } from '../../agents/images/thumbnail'
import { ConversationFeedSync } from '../../claude/conversation/conversation-feed'
import { claudeHome, findTranscript, transcriptDirs } from '../../claude/history/transcript-paths'
import { ScenarioAuthor } from '../../scenarios/author/scenario-author'
import { scenarioAccounts } from './claude-scenario-accounts'
import { claudeSessions } from './claude-sessions'

/** Имена моделей Claude Code: семьи и полные id; чужое имя (модель Codex, OpenCode) - не его. */
const CLAUDE_MODEL = /^(opus|sonnet|haiku|fable|mythos|default|claude-)/i

/**
 * Модель сценария, если Claude Code её знает (семья, каталог аккаунта, свои модели человека);
 * сценарий для другого провайдера - модель новой вкладки (пусто).
 */
const claudeModelOr = (model: string, claude: ClaudeService): string => {
  const known =
    CLAUDE_MODEL.test(model) ||
    claude.cli.models.some((one) => one.value === model) ||
    claude.settings.prefs.customModels.includes(model)

  return known ? model : ''
}

/**
 * Claude Code как исполнитель сценариев: процессы `claude -p` движка сценариев (claude-sessions),
 * аккаунты панели с выручкой на лимите, имя очереди от haiku.
 */
export const claudeScenarioProvider = (
  claude: ClaudeService,
  dataDir: string,
  /** Модель служебной работы из Settings → AI; пусто - Haiku на именах, новая вкладка на черновиках. */
  serviceModel: () => string = () => '',
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
    defaults: () => ({ ...defaults(), model: serviceModel() || defaults().model }),
  })

  return {
    id: 'claude',
    prepare: sessions.prepare,
    spawn: (spec, place, wires) =>
      sessions.spawn({ ...spec, model: claudeModelOr(spec.model, claude) }, place, wires),
    transcriptDirs: (cwd) => transcriptDirs(cwd).catch(() => []),
    chatIdOf: (sessionId) => Promise.resolve(sessionId || null),
    stepFeed: async (cwd, sessionId) => {
      if (!(await findTranscript(cwd, sessionId))) return null

      const feed = new ConversationFeedSync(sessionId, () => undefined, makeThumbnail)

      return {
        ensureLoaded: () => feed.ensureLoaded(cwd, sessionId, null),
        loadEarlier: () => feed.loadEarlier(),
        snapshot: () => feed.snapshot(),
        dispose: () => feed.dispose(),
      }
    },
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
          model: serviceModel() || 'haiku',
          // Своя пустая папка: без хуков и CLAUDE.md чужого проекта.
          cwd: join(dataDir, 'scenario-titles'),
          timeoutMs: TITLE_MS,
          signal: AbortSignal.timeout(TITLE_MS),
        },
      )

      return 'output' in result ? titleOf(result.output) : null
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
