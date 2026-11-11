import type { ProviderId } from '@shared/providers'
import type { ScenarioDraftOutcome } from '@shared/scenario-view'
import type { ScenarioCode, ScenarioScope } from '@shared/scenarios'

import type { EngineAccounts } from '../scenarios/engine/engine-core'
import type {
  SessionSpec,
  SessionWires,
  SessionProcess,
} from '../scenarios/engine/scenario-session'

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
  /** Модель и усилие новой вкладки - на них идут пустые поля сценария. */
  defaults: () => { model: string; effort: string }
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
}
