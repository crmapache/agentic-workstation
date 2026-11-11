import type { CommandFailure, CommandOutcome } from '../remote/command-desk'

/** Отказ команды как ошибка - для React Query (useMutation, useQuery). */
export class CommandError extends Error {
  readonly code: CommandFailure
  readonly detail: string | undefined

  constructor(outcome: Extract<CommandOutcome, { ok: false }>) {
    super(`command refused: ${outcome.code}`)
    this.code = outcome.code
    this.detail = outcome.detail
  }
}
