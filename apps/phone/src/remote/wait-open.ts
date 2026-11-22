import type { MachineSession } from './machine-session'

/** Как часто смотреть, открылась ли линия. */
const POLL_MS = 100

/**
 * Дождаться открытых ключей с IDE, но не дольше timeoutMs: команда и «забудь меня» ждут линию,
 * а не падают сразу. Пары нет или её отпустили - false сразу.
 */
export const waitOpen = async (
  sessions: ReadonlyMap<string, MachineSession>,
  agentId: string,
  timeoutMs: number,
): Promise<boolean> => {
  for (let waited = 0; ; waited += POLL_MS) {
    const session = sessions.get(agentId)

    if (!session || session.record.revoked) return false
    if (session.isOpen) return true
    if (waited >= timeoutMs) return false

    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}
