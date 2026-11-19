import type { ToolsFailure } from '@shared/claude-tools'

export type ScreenFailureProps = {
  failure: ToolsFailure
  detail: string
  projectId: string
  /** Папке доверились - спросить список заново. */
  onTrusted: () => void
}
