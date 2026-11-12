import { openChromeExtensions, revealExtensionFolder } from '../browser/browser-open'
import { openInAgentApp, installedAgentApps } from '../connectors/agent-apps'
import { MAX_AGENT_PROMPT } from '../connectors/agent-links'
import type { ConnectorsService } from '../connectors/connectors-service'
import { openSlackAppCreation } from '../connectors/slack-app'
import {
  field,
  assertKeys,
  MAX_SECRET,
  assertBoolean,
  assertAgentApp,
  assertGenerate,
  assertAddToType,
  assertAddRequest,
  assertUpdateType,
  assertDescription,
  assertAvailability,
} from './connectors-validate'
import type { InvokeHandlers } from './handle'

type ConnectorsChannels = Extract<keyof InvokeHandlers, `connectors:${string}`>

/**
 * Каналы коннекторов: проверить запрос, позвать ConnectorsService, вернуть состояние.
 * Приложения ИИ и создание Slack app - без сервиса: у них нет состояния.
 */
export const createConnectorsHandlers = (
  connectors: ConnectorsService,
): Pick<InvokeHandlers, ConnectorsChannels> => ({
  'connectors:get': () => connectors.getState(),
  'connectors:add': (request) => connectors.add(assertAddRequest(request)),
  'connectors:remove': ({ id }) => connectors.remove(field(id, 'id')),
  'connectors:addToType': (request) => connectors.addToType(assertAddToType(request)),
  'connectors:removeType': ({ typeId }) => connectors.removeType(field(typeId, 'typeId')),
  'connectors:updateType': (request) => connectors.updateType(assertUpdateType(request)),
  'connectors:signIn': ({ id }) => connectors.signIn(field(id, 'id')),
  'connectors:cancelSignIn': ({ id }) => connectors.cancelSignIn(field(id, 'id')),
  'connectors:signOut': ({ id }) => connectors.signOut(field(id, 'id')),
  'connectors:setEnabled': ({ id, enabled }) =>
    connectors.setEnabled(field(id, 'id'), assertBoolean(enabled, 'enabled')),
  'connectors:setToolEnabled': ({ id, tool, enabled }) =>
    connectors.setToolEnabled(
      field(id, 'id'),
      field(tool, 'tool'),
      assertBoolean(enabled, 'enabled'),
    ),
  'connectors:refresh': ({ id }) => connectors.refresh(field(id, 'id')),
  'connectors:setToken': ({ id, token }) =>
    connectors.setToken(field(id, 'id'), field(token, 'token', MAX_SECRET)),
  'connectors:setDescription': ({ id, description }) =>
    connectors.setDescription(field(id, 'id'), assertDescription(description)),
  'connectors:setAvailability': ({ id, availability }) =>
    connectors.setAvailability(field(id, 'id'), assertAvailability(availability)),
  'connectors:importCandidates': () => connectors.imports.candidates(),
  'connectors:import': async ({ keys }) => {
    const { imported, skipped } = await connectors.imports.import(assertKeys(keys))

    return { state: connectors.getState(), imported, skipped }
  },
  'connectors:generate': (request) => {
    connectors.ai.generate(assertGenerate(request))

    return connectors.getState()
  },
  'connectors:cancelGenerate': () => {
    connectors.ai.cancel()

    return connectors.getState()
  },
  'connectors:dismissGeneration': () => {
    connectors.ai.dismiss()

    return connectors.getState()
  },
  'connectors:importGoogleApp': () => connectors.importGoogleApp(),
  'connectors:forgetGoogleApp': () => connectors.forgetGoogleApp(),
  'connectors:agentApps': () => installedAgentApps(),
  'connectors:openInAgentApp': ({ app, prompt }) =>
    openInAgentApp(assertAgentApp(app), field(prompt, 'prompt', MAX_AGENT_PROMPT)),
  'connectors:createSlackApp': () => openSlackAppCreation(),
  'connectors:revealBrowserExtension': () =>
    revealExtensionFolder(connectors.getState().browser.extensionDir),
  'connectors:openBrowserExtensions': () => openChromeExtensions(),
})
