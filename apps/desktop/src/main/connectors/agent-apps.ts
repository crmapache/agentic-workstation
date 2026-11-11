import { app, shell } from 'electron'

import type { AgentApp } from '@shared/connectors'
import { AGENT_APPS } from '@shared/connectors'

import { agentLink, AGENT_SCHEMES } from './agent-links'

const isInstalled = (agent: AgentApp): boolean =>
  app.getApplicationNameForProtocol(AGENT_SCHEMES[agent]) !== ''

/** Приложения ИИ, которые стоят на этом Mac: в меню настройки - только они. */
export const installedAgentApps = (): AgentApp[] => AGENT_APPS.filter(isInstalled)

/**
 * Новый разговор в приложении ИИ с промптом в поле ввода. Второй путь наружу рядом с
 * openExternalWeb: адрес не приходит из окна, а собирается здесь из своей схемы, поэтому
 * чужое приложение или file:// им не открыть. Нет приложения или macOS не открыла - false.
 */
export const openInAgentApp = async (agent: AgentApp, prompt: string): Promise<boolean> => {
  if (!isInstalled(agent)) return false

  try {
    await shell.openExternal(agentLink(agent, prompt))

    return true
  } catch (error) {
    console.warn('[connectors] приложение ИИ не открылось:', agent, error)

    return false
  }
}
