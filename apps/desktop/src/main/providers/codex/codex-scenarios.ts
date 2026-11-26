import { join } from 'node:path'

import type { ScenarioProvider } from '../scenario-provider'
import { titleOf, TITLE_MS, titlePrompt, TITLE_SCHEMA } from '../scenario-titles'
import { ProviderAuthor } from '../run-stream/provider-author'
import { setRunJournals } from '../run-stream/run-history'
import { RunJournal } from '../run-stream/run-journal'
import type { CodexService } from '../../codex/codex-service'
import { releaseHead } from '../../agents/history/released-runs'
import { makeThumbnail } from '../../agents/images/thumbnail'
import { CodexFeedSync } from '../../codex/conversation/codex-feed'
import { askCodexOnce } from './codex-ask'
import { codexRunAccounts } from './codex-run-accounts'
import { choiceOf, CodexRunProcess } from './codex-run-process'

/** Папка журналов сессий прогонов Codex в данных IDE (run-journal.ts). */
export const CODEX_RUNS_DIR = join('run-sessions', 'codex')

/**
 * Codex как исполнитель сценариев и заданий (docs/plan-providers/50-ide.md): процессы сессий -
 * переводчик `codex app-server` в поток Claude (codex-run-process.ts), аккаунты Codex с
 * выручкой на лимите, имя очереди и черновик сценария - разовым вопросом Codex, «продолжить в
 * чате» - поток прогона вкладкой панели Codex.
 */
export const codexScenarioProvider = (
  codex: CodexService,
  dataDir: string,
  /** Модель служебной работы из Settings → AI; пусто - модель Codex по умолчанию. */
  serviceModel: () => string = () => '',
): ScenarioProvider => {
  const journalDir = join(dataDir, CODEX_RUNS_DIR)

  // История панели прячет разговоры прогонов по журналам этой папки.
  setRunJournals('codex', journalDir)
  const facts = codex.forRuns
  const host = { ...facts, journalDir }
  const defaults = () => {
    const prefs = codex.getState().prefs

    return { model: prefs.newTabModel ?? '', effort: prefs.newTabEffort ?? '' }
  }
  const ask: ConstructorParameters<typeof ProviderAuthor>[0]['ask'] = (question) =>
    askCodexOnce(host, facts.desk.accounts.current, question)
  const author = new ProviderAuthor({
    provider: 'codex',
    ask,
    defaults: () => ({ ...defaults(), model: serviceModel() || defaults().model }),
  })

  return {
    id: 'codex',
    prepare: async () => ((await host.cli(facts.desk.accounts.current)) ? null : 'noCli'),
    spawn: (spec, place, wires) => new CodexRunProcess(host, spec, place, wires),
    // Тем же выбором, что и прогон; каталога ещё нет - как в сценарии: решать будет сам Codex.
    fitRunsOn: (choice) => {
      const models = facts.models()

      if (models.length === 0) return choice

      const fitted = choiceOf(choice, models)

      return { model: fitted.model ?? '', effort: fitted.effort ?? '' }
    },
    transcriptDirs: () => Promise.resolve([journalDir]),
    chatIdOf: async (sessionId) => (await RunJournal.open(journalDir, sessionId)).native,
    // Журнал шага - ходами потока Codex (`thread/turns/list`), как лента вкладки.
    stepFeed: async (_cwd, sessionId) => {
      const threadId = (await RunJournal.open(journalDir, sessionId)).native

      return threadId
        ? new CodexFeedSync(sessionId, () => undefined, makeThumbnail, {
            threadId: () => threadId,
            turns: (thread, cursor) => facts.turns(thread, cursor),
            fork: () => null,
          })
        : null
    },
    defaults,
    accounts: codexRunAccounts(facts.desk),
    suggestTitle: async (description) => {
      const answer = await ask({
        prompt: titlePrompt(description),
        schema: TITLE_SCHEMA,
        model: serviceModel(),
        effort: 'low',
        // Своя пустая папка: без правил и файлов чужого проекта.
        cwd: join(dataDir, 'scenario-titles'),
        timeoutMs: TITLE_MS,
      })

      return 'output' in answer ? titleOf(answer.output) : null
    },
    draft: (projectPath, draftId, description, scope) =>
      author.draft(projectPath, draftId, description, scope),
    cancelDraft: (draftId) => author.cancel(draftId),
    askOnce: ask,
    // Указания роли - в самом потоке: вкладка продолжит его со снятием роли (codex-session).
    releaseChat: (chatId) => {
      releaseHead(chatId)

      return Promise.resolve()
    },
    openChat: async (cwd, sessionId) => {
      // Разговор движка - его UUID; у Codex это поток из журнала сессии.
      const threadId = (await RunJournal.open(journalDir, sessionId)).native

      if (!threadId) return false

      releaseHead(threadId)

      return codex
        .openHistory(cwd, threadId)
        .then(() => true)
        .catch(() => false)
    },
  }
}
