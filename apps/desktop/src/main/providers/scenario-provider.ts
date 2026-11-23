import type { ConversationFeed } from '@shared/conversation-feed'
import type { ProviderId } from '@shared/providers'
import type { RunsOn } from '@shared/scenario-queues'
import type { ScenarioDraftOutcome } from '@shared/scenario-view'
import type { ScenarioCode, ScenarioScope } from '@shared/scenarios'

import type { EngineAccounts } from '../scenarios/engine/engine-core'
import type {
  SessionSpec,
  SessionWires,
  SessionProcess,
} from '../scenarios/engine/scenario-session'
import type { AskOnce, AskOnceResult } from './run-stream/ask-once'

/**
 * Лента разговора шага для окна (журнал шага): последняя страница, ранние - по просьбе. Живых
 * заплат нет: окно спрашивает страницы, а не слушает поток.
 */
export type StepFeed = {
  ensureLoaded: () => Promise<void>
  loadEarlier: () => Promise<ConversationFeed>
  snapshot: () => ConversationFeed
  dispose: () => void
}

/**
 * Что сценариям нужно от провайдера ИИ. Движок прогона говорит с сессиями на потоке
 * stream-json Claude Code как на своём внутреннем формате (так он перенесён из ACC и проверен
 * тестами); провайдер, у которого поток другой, приносит переводчик в этот формат вместе с
 * собой - движок при этом не меняется.
 */
export type ScenarioProvider = {
  readonly id: ProviderId
  /** Можно ли сейчас вести прогон в проекте: CLI на месте, папке доверяют. null - можно. */
  prepare: (projectPath: string) => Promise<ScenarioCode | null>
  /**
   * Процесс головы или карточки в папке cwd (проект или worktree очереди). Коннекторы IDE -
   * по исходному проекту projectPath. null - процесс не поднять (CLI пропал, аккаунта нет).
   */
  spawn: (
    spec: SessionSpec,
    place: { cwd: string; projectPath: string },
    wires: SessionWires,
  ) => SessionProcess | null
  /** Папки, где провайдер пишет разговоры, сделанные в cwd. */
  transcriptDirs: (cwd: string) => Promise<string[]>
  /**
   * Лента разговора сессии движка (журнал шага в окне) - журналом самого провайдера; null -
   * разговора нет.
   */
  stepFeed: (cwd: string, sessionId: string) => Promise<StepFeed | null>
  /**
   * id разговора сессии движка в панели провайдера (вкладка, история, статистика): у Claude -
   * тот же, у Codex - поток, у OpenCode - сессия; null - разговора у провайдера ещё нет.
   */
  chatIdOf: (sessionId: string) => Promise<string | null>
  /** Модель и усилие новой вкладки - на них идут пустые поля сценария. */
  defaults: () => { model: string; effort: string }
  /**
   * Модель и усилие, с которыми провайдер правда поднимет сессию: чужую ему модель (сценарий
   * писали для другого провайдера) он меняет на свою по умолчанию, чужой уровень - на уровень
   * модели. Этим очередь показывает, на чём идёт сценарий; нет - берёт как есть.
   */
  fitRunsOn?: ((choice: RunsOn) => RunsOn) | undefined
  accounts: EngineAccounts
  /** Короткое имя работы по её описанию; null - модель не ответила. */
  suggestTitle: (description: string) => Promise<string | null>
  /** Модель пишет черновик сценария по фразе; сохраняет его человек. */
  draft: (
    projectPath: string,
    draftId: string,
    description: string,
    scope: ScenarioScope,
  ) => Promise<ScenarioDraftOutcome>
  cancelDraft: (draftId: string) => void
  /**
   * Продолжить разговор головы прогона обычной вкладкой панели провайдера (Continue in a chat):
   * роль главного потока с разговора снимается. cwd - папка прогона (проект или worktree).
   */
  openChat: (cwd: string, sessionId: string) => Promise<boolean>
  /**
   * Разовый вопрос служебной работы (проверка поручения, черновик задания) у провайдера без
   * своего `claude -p`: Codex и открытые модели. У Claude Code его нет - его служебная работа
   * идёт прежним путём (structured-ask.ts).
   */
  askOnce?: ((ask: AskOnce) => Promise<AskOnceResult>) | undefined
  /**
   * Разговор прогона открывают чатом: снять роль прогона (указания головы или задания живут в
   * самом разговоре Codex и OpenCode). У Claude Code их несёт процесс, а не разговор: снимать
   * нечего, кроме роли головы, - это делает его openChat.
   */
  releaseChat?: ((chatId: string) => Promise<void>) | undefined
}
