import type { ProviderId } from '@shared/providers'
import type { ScenarioDraftOutcome } from '@shared/scenario-view'
import type { ScenarioScope } from '@shared/scenarios'

import { authorBody, AUTHOR_SYSTEM_PROMPT } from '../../scenarios/author/author-instructions'
import { readAuthorOutput } from '../../scenarios/author/author-parse'
import type { AskOnce, AskOnceResult } from './ask-once'

/** Модель читает проект и пишет сценарий: столько же, сколько у Claude Code. */
const AUTHOR_MS = 600_000

/** Что автору нужно от провайдера: разовый вопрос и выбор новой вкладки. */
export type AuthorAsk = {
  /** Чей автор: сценарий пишется для этого провайдера. */
  provider: ProviderId
  ask: (ask: AskOnce) => Promise<AskOnceResult>
  defaults: () => { model: string; effort: string }
}

/**
 * Черновик сценария у провайдера без Claude Code (Codex, OpenCode): та же инструкция автора и
 * тот же разбор ответа, что у ScenarioAuthor, но разговором провайдера - в папке проекта, с
 * чтением без записи. Скиллов Claude в каталоге нет: карточки этого провайдера их не вызовут.
 * Черновик не сохраняется - его открывает редактор, Save жмёт человек.
 */
export class ProviderAuthor {
  private readonly running = new Map<string, AbortController>()

  constructor(private readonly host: AuthorAsk) {}

  cancel(draftId: string): void {
    this.running.get(draftId)?.abort()
    this.running.delete(draftId)
  }

  async draft(
    projectPath: string,
    draftId: string,
    description: string,
    scope: ScenarioScope,
  ): Promise<ScenarioDraftOutcome> {
    if (!description.trim()) return { ok: false, error: 'empty', cancelled: false }

    const controller = new AbortController()
    const { model, effort } = this.host.defaults()

    this.running.set(draftId, controller)

    try {
      const answer = await this.host.ask({
        prompt: authorBody(description, []),
        system: AUTHOR_SYSTEM_PROMPT,
        model,
        effort,
        cwd: projectPath,
        readProject: true,
        timeoutMs: AUTHOR_MS,
        signal: controller.signal,
      })

      if (controller.signal.aborted) return { ok: false, error: '', cancelled: true }
      if ('error' in answer) {
        return {
          ok: false,
          error: answer.error.split('\n')[0]?.slice(0, 200) ?? '',
          cancelled: false,
        }
      }

      const read = readAuthorOutput(answer.text, scope)

      return 'scenario' in read
        ? {
            ok: true,
            scenario: {
              ...read.scenario,
              head: { ...read.scenario.head, provider: this.host.provider },
            },
          }
        : { ok: false, error: read.error || 'unreadable', cancelled: false }
    } finally {
      this.running.delete(draftId)
    }
  }
}
