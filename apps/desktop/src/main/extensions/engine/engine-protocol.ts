import type { ExtensionProblem, ExtensionLogEntry } from '@shared/extensions'

import type { SandboxSpec } from './sandbox'

/**
 * Сообщения между главным процессом и потоком песочниц расширений (ADR 0091). Песочницы живут
 * в отдельном потоке: расширение, которое считает до срока, не держит окно и IPC IDE.
 */
export type ToEngine =
  | { type: 'start'; callId: number; spec: SandboxSpec }
  | { type: 'stop'; callId: number; id: string }
  | { type: 'dispatch'; callId: number; id: string; handler: number; args: unknown[] }
  | { type: 'forget'; id: string; handler: number }
  | { type: 'hostAnswer'; hostCallId: number; raw: string }

export type FromEngine =
  | { type: 'done'; callId: number; ok: true; value: unknown }
  | { type: 'done'; callId: number; ok: false; error: string; problem: ExtensionProblem | null }
  | { type: 'host'; hostCallId: number; id: string; method: string; payload: string }
  | { type: 'log'; id: string; level: ExtensionLogEntry['level']; text: string }
  | { type: 'broke'; id: string; problem: ExtensionProblem }
