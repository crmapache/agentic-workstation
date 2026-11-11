import type { AgentMessage } from '@agentic-workstation/remote-protocol/agent-messages'

import type { CommandDesk } from './command-desk'
import type { Handshakes } from './handshakes'
import type { MachineSession } from './machine-session'
import type { WatchDesk } from './watch-desk'

/** Кто занимается словами IDE в ядре телефона. */
export type AgentRoutes = {
  watches: WatchDesk
  commands: CommandDesk
  handshakes: Handshakes
  /** Посланное могло пропасть: список, подписки и команды - заново (RemoteClient). */
  catchUp: (session: MachineSession) => void
}

/**
 * Открытое слово IDE - тому, кто им занимается: ленты - столу подписок, итоги и отказы - столу
 * команд, «тебя отпустили» - рукопожатиям. Остальное (инвентарь, состояние разговора, очереди,
 * прогон) экраны берут из события ядра сами.
 */
export const routeAgentMessage = (
  routes: AgentRoutes,
  session: MachineSession,
  message: AgentMessage,
): void => {
  const { agentId } = session

  switch (message.k) {
    case 'inventory':
      session.caps = message.caps
      break
    case 'feed':
      routes.watches.snapshot(agentId, message)
      break
    case 'patch':
      routes.watches.patch(agentId, message)
      break
    case 'conversationGone':
      routes.watches.gone(agentId, message.conversationId)
      break
    case 'result':
      routes.commands.result(message)
      break
    case 'notice':
      routes.commands.noticed(message)
      break
    case 'resync':
      routes.catchUp(session)
      break
    case 'revoked':
      void routes.handshakes.revoked(session, message.tag)
      break
  }
}
