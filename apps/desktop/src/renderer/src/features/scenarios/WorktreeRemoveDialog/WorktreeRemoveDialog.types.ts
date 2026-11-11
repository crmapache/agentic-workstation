import type { ScenariosModal } from '../scenarios.types'

export type WorktreeRemoveDialogProps = {
  request: Extract<ScenariosModal, { kind: 'worktreeRemove' }>
}

/** Строка вопроса об удалении - имя строки в i18n и её число. */
export type WorktreeFactLine =
  { kind: 'missing' } | { kind: 'ahead'; count: number } | { kind: 'dirty' } | { kind: 'clean' }
