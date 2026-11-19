import type { AcpProcess } from './acp-process'
import { ACP_SESSION_TIMEOUT_MS } from './acp.constants'

/** Форк процессом, который держит разговор: новый id, форк сразу отпущен для вкладки форка. */
export const forkIn = async (
  process: AcpProcess,
  sessionId: string,
  cwd: string,
): Promise<string | null> => {
  // Серверы коннекторов форк берёт у источника (Kimi пишет об этом предупреждение на непустые).
  const forked = (await process.request(
    'session/fork',
    { sessionId, cwd, mcpServers: [] },
    ACP_SESSION_TIMEOUT_MS,
  )) as { sessionId?: unknown } | null
  const id = typeof forked?.sessionId === 'string' ? forked.sessionId : null

  if (id) await process.request('session/close', { sessionId: id }).catch(() => undefined)

  return id
}
