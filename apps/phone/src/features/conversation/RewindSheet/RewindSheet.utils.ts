import type { RewindPreviewWire } from '@agentic-workstation/remote-protocol/conversation-wire-types'

import type { RewindScope } from './RewindSheet.types'

/**
 * Что можно откатить: код - только когда IDE знает, какие файлы вернуть (ready), и только код -
 * не посреди хода (CLI не вернёт файлы под работающим агентом). Чего провайдер не умеет
 * (allowed: у OpenCode код откатывается только вместе с разговором), не предлагается.
 */
export const rewindScopes = (
  preview: RewindPreviewWire | undefined,
  running: boolean,
  allowed?: readonly string[],
): RewindScope[] => {
  const scopes: RewindScope[] =
    preview?.state !== 'ready'
      ? ['conversation']
      : running
        ? ['both', 'conversation']
        : ['both', 'conversation', 'code']

  return allowed ? scopes.filter((scope) => allowed.includes(scope)) : scopes
}

/** Выбранное, если оно ещё доступно, иначе первое доступное (с кодом, если можно). */
export const effectiveScope = (chosen: RewindScope | null, scopes: RewindScope[]): RewindScope =>
  chosen && scopes.includes(chosen) ? chosen : (scopes[0] ?? 'conversation')
