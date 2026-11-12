/** Куда поставить сценарий: новая очередь или существующая по id. */
export type TargetChoice = { kind: 'new' } | { kind: 'queue'; queueId: string }

/** Форма запуска: что выбрано и что отвечено. */
export type StartForm = {
  /** `scope:id` - сценарий на полке; пусто - не выбран. */
  scenario: string
  inputs: Record<string, string>
  target: TargetChoice
  worktree: boolean
  afterSuccess: boolean
  provider: string
}
