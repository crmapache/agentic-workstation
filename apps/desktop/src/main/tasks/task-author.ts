import { basename } from 'node:path'

import type { TaskAuthorError, TaskAuthorOutcome } from '@shared/task-author'

import { AiRuns } from '../claude/search/ai-runs'
import { authorPrompt, AUTHOR_SCHEMA } from './task-author-brief'
import type { AuthorConnector } from './task-author-brief'
import { authoredTask } from './task-author-parse'

/** Ответ провайдера на разовый вопрос: объект по схеме или отказ (detail - его слова). */
export type AuthorAnswer =
  { output: unknown } | { failure: 'cancelled' | TaskAuthorError; detail: string }

export type TaskAuthorHost = {
  /** Разовый вопрос по схеме, без инструментов; провайдер выбирает модель и аккаунт. */
  ask: (prompt: string, schema: object, signal: AbortSignal) => Promise<AuthorAnswer>
  /** Коннекторы, которые увидят прогоны проекта. */
  connectors: (projectPath: string) => readonly AuthorConnector[]
  now: () => Date
}

const CANCELLED: TaskAuthorOutcome = { ok: false, cancelled: true }

const refused = (error: TaskAuthorError, detail = ''): TaskAuthorOutcome => ({
  ok: false,
  cancelled: false,
  error,
  detail,
})

/**
 * ИИ пишет задание из слов человека (вкладка «With AI» окна задания) и НЕ сохраняет его:
 * написанное открывает форма, Save жмёт человек. Один вопрос модели по схеме, без инструментов и
 * чтения проекта: прогон сам прочтёт проект, а задание нужно за секунды. Отмена - по номеру
 * запроса.
 */
export class TaskAuthor {
  private readonly runs = new AiRuns<AbortController>((controller) => controller.abort())

  constructor(private readonly host: TaskAuthorHost) {}

  cancel(authorId: string): void {
    this.runs.cancel(authorId)
  }

  async write(
    projectPath: string,
    authorId: string,
    description: string,
  ): Promise<TaskAuthorOutcome> {
    const controller = new AbortController()

    this.runs.asked(authorId)
    this.runs.started(authorId, controller)

    try {
      const now = this.host.now()
      const prompt = authorPrompt(description, {
        projectName: basename(projectPath),
        projectPath,
        connectors: this.host.connectors(projectPath),
        now,
      })
      const answer = await this.host.ask(prompt, AUTHOR_SCHEMA, controller.signal)

      if (controller.signal.aborted) return CANCELLED
      if ('failure' in answer) {
        return answer.failure === 'cancelled' ? CANCELLED : refused(answer.failure, answer.detail)
      }

      const task = authoredTask(answer.output, now)

      return task ? { ok: true, task } : refused('unreadable')
    } finally {
      this.runs.finished(authorId)
    }
  }
}
