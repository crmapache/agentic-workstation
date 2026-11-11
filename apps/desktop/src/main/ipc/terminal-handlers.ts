import type { TerminalInvokeContract } from '@shared/ipc/terminal.contract'

import type { TerminalService } from '../terminal/terminal-service'
import { TERMINAL_SIZE_MAX } from '../terminal/terminal.constants'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'
import { projectRootOf } from './workspace-handlers'

type TerminalChannels = keyof TerminalInvokeContract

/** Целое число в пределах: размер в знаках, счёт дорисованного. */
const assertCount = (value: unknown, name: string, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Ожидалось целое число в поле ${name}`)
  }

  return value
}

const sessionOf = (sessionId: unknown): string => {
  assertString(sessionId, 'sessionId')

  return sessionId
}

/** Каналы терминала (ADR 0037): проверить запрос и позвать сервис. */
export const createTerminalHandlers = (
  workspace: WorkspaceService,
  terminals: TerminalService,
): Pick<InvokeHandlers, TerminalChannels> => ({
  'terminal:list': () => terminals.list(),
  'terminal:create': ({ projectId, cols, rows }) =>
    terminals.open(
      projectId,
      projectRootOf(workspace, projectId),
      assertCount(cols, 'cols', 1, TERMINAL_SIZE_MAX),
      assertCount(rows, 'rows', 1, TERMINAL_SIZE_MAX),
    ),
  'terminal:close': ({ sessionId }) => terminals.close(sessionOf(sessionId)),
  'terminal:write': ({ sessionId, data }) => {
    assertString(data, 'data')
    terminals.write(sessionOf(sessionId), data)
  },
  'terminal:resize': ({ sessionId, cols, rows }) =>
    terminals.resize(
      sessionOf(sessionId),
      assertCount(cols, 'cols', 1, TERMINAL_SIZE_MAX),
      assertCount(rows, 'rows', 1, TERMINAL_SIZE_MAX),
    ),
  'terminal:replay': ({ sessionId }) => terminals.replay(sessionOf(sessionId)),
  'terminal:ack': ({ sessionId, chars }) =>
    terminals.ack(sessionOf(sessionId), assertCount(chars, 'chars', 0, Number.MAX_SAFE_INTEGER)),
})
