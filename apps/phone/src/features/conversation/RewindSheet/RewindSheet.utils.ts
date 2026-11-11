import type { RewindPreviewWire } from '@agentic-workstation/remote-protocol/conversation-wire-types'

import type { RewindScope } from './RewindSheet.types'

/**
 * Что можно откатить: код - только когда IDE знает, какие файлы вернуть (ready), и только код -
 * не посреди хода (CLI не вернёт файлы под работающим агентом).
 */
export const rewindScopes = (
  preview: RewindPreviewWire | undefined,
  running: boolean,
): RewindScope[] => {
  if (preview?.state !== 'ready') return ['conversation']

  return running ? ['both', 'conversation'] : ['both', 'conversation', 'code']
}

/** Выбранное, если оно ещё доступно, иначе первое доступное (с кодом, если можно). */
export const effectiveScope = (chosen: RewindScope | null, scopes: RewindScope[]): RewindScope =>
  chosen && scopes.includes(chosen) ? chosen : (scopes[0] ?? 'conversation')
