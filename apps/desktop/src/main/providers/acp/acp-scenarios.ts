import { join } from 'node:path'

import type { ProviderId } from '@shared/providers'

import { providerLabel } from '../provider-registry'
import type { ScenarioProvider } from '../scenario-provider'
import { titleOf, TITLE_MS, titlePrompt, TITLE_SCHEMA } from '../scenario-titles'
import type { AskOnce } from '../run-stream/ask-once'
import { ProviderAuthor } from '../run-stream/provider-author'
import { setRunJournals } from '../run-stream/run-history'
import { RunJournal, journalPath } from '../run-stream/run-journal'
import { SINGLE_ACCOUNT } from '../run-stream/single-account'
import type { AcpPanel } from '../../acp/acp-panel'
import { releaseHead } from '../../agents/history/released-runs'
import { askAcpOnce } from './acp-ask'
import { AcpRunProcess } from './acp-run-process'
import { isRunSessionHeld } from './acp-run-session'
import { AcpStepFeed, journalFeed } from './acp-step-feed'

/** Папка журналов сессий прогонов агента ACP в данных IDE (run-journal.ts). */
export const acpRunsDir = (provider: ProviderId): string => join('run-sessions', provider)

/**
 * Агент ACP как исполнитель сценариев, заданий и коннектора от ИИ (ADR 0085, 0092): процессы
 * сессий - переводчик ACP в поток Claude (acp-run-process.ts), вход один - без переезда на
 * лимите, имя очереди и черновик сценария - разовым вопросом в плане, журнал шага - повтором
 * разговора у агента, «продолжить в чате» - разговор прогона вкладкой панели агента. Только
 * провайдеру, которому правило фоновой работы это разрешает (ADR 0094): у Antigravity его нет.
 */
export const acpScenarioProvider = (
  panel: AcpPanel,
  dataDir: string,
  /** Модель служебной работы из Settings → AI; пусто - модель агента по умолчанию. */
  serviceModel: () => string = () => '',
): ScenarioProvider => {
  const { provider } = panel.agent
  const journalDir = join(dataDir, acpRunsDir(provider))

  // История панели прячет разговоры прогонов по журналам этой папки.
  setRunJournals(provider, journalDir)
  const host = panel.runHost(journalDir, providerLabel(provider))
  const defaults = () => {
    const prefs = panel.getState().prefs

    return { model: prefs.newTabModel ?? '', effort: prefs.newTabEffort ?? '' }
  }
  const ask = (question: AskOnce) => askAcpOnce(host, question)
  const author = new ProviderAuthor({
    provider,
    ask,
    isTrusted: (path) => panel.isTrusted(path),
    defaults: () => ({ ...defaults(), model: serviceModel() || defaults().model }),
  })
  const nativeOf = async (sessionId: string) =>
    (await RunJournal.open(journalDir, sessionId)).native

  return {
    id: provider,
    prepare: async (projectPath) => {
      if (!(await host.cli())) return 'noCli'
      if (!(await panel.isTrusted(projectPath))) return 'untrusted'

      return null
    },
    spawn: (spec, place, wires) => new AcpRunProcess(host, spec, place, wires),
    transcriptDirs: () => Promise.resolve([journalDir]),
    chatIdOf: nativeOf,
    // Журнал шага - повтором разговора у агента, как лента вкладки. Разговор держит идущий
    // прогон (у Kimi одна сессия - один писатель) или агент его не отдал - журналом прогона.
    stepFeed: async (cwd, sessionId) => {
      const native = await nativeOf(sessionId)

      return native
        ? new AcpStepFeed(
            sessionId,
            async () =>
              (!isRunSessionHeld(native) && (await panel.catalog.replay(native, cwd))) ||
              journalFeed(journalPath(journalDir, sessionId)),
          )
        : null
    },
    defaults,
    accounts: SINGLE_ACCOUNT,
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
    // Бриф прогона - первое сообщение самого разговора, убрать его нечем: снимается роль, и
    // рамка «прогон окончен» уходит первым сообщением чата (acp-session.ts).
    releaseChat: (chatId) => {
      releaseHead(chatId)

      return Promise.resolve()
    },
    openChat: async (cwd, sessionId) => {
      const native = await nativeOf(sessionId)

      if (!native) return false

      releaseHead(native)

      return panel
        .openHistory(cwd, native)
        .then(() => true)
        .catch(() => false)
    },
  }
}
