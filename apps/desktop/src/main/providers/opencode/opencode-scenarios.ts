import { join } from 'node:path'

import type { ScenarioProvider } from '../scenario-provider'
import { titleOf, TITLE_MS, titlePrompt, TITLE_SCHEMA } from '../scenario-titles'
import { ProviderAuthor } from '../run-stream/provider-author'
import { setRunJournals } from '../run-stream/run-history'
import { RunJournal } from '../run-stream/run-journal'
import { SINGLE_ACCOUNT } from '../run-stream/single-account'
import type { OpenModelsService } from '../../opencode/opencode-service'
import { releaseHead } from '../../agents/history/released-runs'
import { makeThumbnail } from '../../agents/images/thumbnail'
import { OpenCodeFeedSync } from '../../opencode/conversation/opencode-feed'
import { askOpenCodeOnce } from './opencode-ask'
import { OpenCodeRunProcess } from './opencode-run-process'

/** Папка журналов сессий прогонов OpenCode в данных IDE (run-journal.ts). */
export const OPENCODE_RUNS_DIR = join('run-sessions', 'opencode')

/**
 * Открытые модели (OpenCode) как исполнитель сценариев и заданий (docs/plan-providers/50-ide.md):
 * процессы сессий - переводчик `opencode serve` в поток Claude (opencode-run-process.ts), имя
 * очереди и черновик сценария - разовым вопросом модели, «продолжить в чате» - сессия прогона
 * вкладкой панели открытых моделей.
 */
export const openCodeScenarioProvider = (
  openModels: OpenModelsService,
  dataDir: string,
  /** Модель служебной работы из Settings → AI; пусто - первая модель подключений. */
  serviceModel: () => string = () => '',
): ScenarioProvider => {
  const journalDir = join(dataDir, OPENCODE_RUNS_DIR)

  // История панели прячет разговоры прогонов по журналам этой папки.
  setRunJournals('opencode', journalDir)
  const host = openModels.runHost(journalDir)
  const defaults = () => {
    const prefs = openModels.getState().prefs

    return { model: prefs.newTabModel ?? '', effort: prefs.newTabEffort ?? '' }
  }
  const author = new ProviderAuthor({
    provider: 'opencode',
    ask: (question) => askOpenCodeOnce(host, question),
    isTrusted: (path) => openModels.isTrusted(path),
    defaults: () => ({ ...defaults(), model: serviceModel() || defaults().model }),
  })

  return {
    id: 'opencode',
    prepare: async (projectPath) => {
      if (!(await host.cli())) return 'noCli'
      if (!(await openModels.isTrusted(projectPath))) return 'untrusted'

      return null
    },
    spawn: (spec, place, wires) => new OpenCodeRunProcess(host, spec, place, wires),
    transcriptDirs: () => Promise.resolve([journalDir]),
    chatIdOf: async (sessionId) => (await RunJournal.open(journalDir, sessionId)).native,
    // Журнал шага - журналом сессии OpenCode, как лента вкладки.
    stepFeed: async (cwd, sessionId) => {
      const native = (await RunJournal.open(journalDir, sessionId)).native

      return native
        ? new OpenCodeFeedSync(
            sessionId,
            () => undefined,
            makeThumbnail,
            () => ({ servers: [], root: cwd }),
            { sessionId: () => native, messages: host.messages, fork: () => null },
          )
        : null
    },
    defaults,
    accounts: SINGLE_ACCOUNT,
    suggestTitle: async (description) => {
      const answer = await askOpenCodeOnce(host, {
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
    askOnce: (question) => askOpenCodeOnce(host, question),
    // Роль прогона живёт в самой сессии (указания): чатом её открывают уже без неё.
    releaseChat: async (chatId) => {
      releaseHead(chatId)
      await host.dropBrief(chatId).catch(() => undefined)
    },
    openChat: async (cwd, sessionId) => {
      const native = (await RunJournal.open(journalDir, sessionId)).native

      if (!native) return false

      releaseHead(native)
      await host.dropBrief(native).catch(() => undefined)

      return openModels
        .openHistory(cwd, native)
        .then(() => true)
        .catch(() => false)
    },
  }
}
