import { join } from 'node:path'

import { shell, clipboard } from 'electron'

import { STORE_URL } from '@agentic-workstation/store-protocol/signing'

import type { ConnectorsService } from '../connectors/connectors-service'
import { action, blankItem } from '../inbox/inbox-items'
import type { InboxService } from '../inbox/inbox-service'
import { broadcast } from '../ipc/broadcast'
import { ELECTRON_CIPHER } from '../storage/electron-cipher'
import { JsonFile } from '../storage/json-file'
import { Vault } from '../storage/vault'
import { openExternalWeb } from '../window/open-external'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { WorkstationLink } from '../workstation/workstation-link'
import type { PanelRegistry } from '../agents/panel/panel-registry'
import { ExtensionStorage } from './extension-storage'
import { ExtensionsService } from './extensions-service'
import { ExtensionsStore } from './extensions-store'
import type { StoredExtensions } from './extensions-store'
import { ExtensionsWatcher } from './extensions-watcher'
import { WindowAsks } from './window-asks'
import { ExtensionAuthoring } from './authoring/authoring'
import engineWorkerPath from './engine/engine-worker?modulePath'
import { workerPort, ExtensionEngine } from './engine/extension-engine'
import { extensionFetch } from './host/net-fetch'
import { runProgram } from './host/run-program'
import { workstationBridge } from './host/workstation-bridge'
import { ExtensionStore } from './store/extension-store'
import { StoreClient } from './store/store-client'
import { storeKeys } from './store/store-keys'

/** Свой адрес магазина: локальный сервер в разработке и проверках. */
const STORE_URL_ENV = 'AGENTIC_WORKSTATION_STORE_URL'

/** Расширения IDE после подъёма: сервис, работа с ИИ и выход. */
export type ExtensionsRuntime = {
  service: ExtensionsService
  authoring: ExtensionAuthoring
  /** Магазин расширений: каталог, установка, публикация, отзывы. */
  shop: ExtensionStore
  shutdown: () => Promise<void>
}

/**
 * Расширения IDE (ADR 0091): поднимаются после сценариев, заданий и уведомлений - им нужны
 * порты workstation и лента уведомлений. Хуки разговоров встают в связку, которую панели
 * получили при своём подъёме.
 */
export const startExtensions = async (setup: {
  root: string
  userData: string
  workspace: WorkspaceService
  inbox: InboxService
  workstation: WorkstationLink
  panels: PanelRegistry
  /** Коннекторы: набор инструментов расширений поменялся - коннектор extensions перечитает их. */
  connectors: ConnectorsService
}): Promise<ExtensionsRuntime> => {
  const { workspace } = setup
  const vault = await Vault.load(join(setup.userData, 'extensions.vault'), ELECTRON_CIPHER)
  const workstation = workstationBridge(setup.workstation)
  const store = await ExtensionsStore.load(
    new JsonFile<StoredExtensions>(join(setup.userData, 'extensions.json')),
  )
  const secrets = {
    get: (key: string) => vault.get(key),
    set: (key: string, value: string | null) => vault.set(key, value),
    forgetPrefix: (prefix: string) => vault.forgetPrefix(prefix),
  }
  const service = new ExtensionsService({
    root: setup.root,
    store,
    storage: new ExtensionStorage(join(setup.userData, 'extensions-data')),
    secrets,
    engine: (events) => new ExtensionEngine(workerPort(engineWorkerPath), events),
    ide: {
      projects: () => {
        const state = workspace.getState()

        return state.projects.map((project) => ({
          path: project.rootPath,
          name: project.name,
          home: project.home === true,
          active: project.id === state.activeProjectId,
        }))
      },
      notify: (runtime, notice) => {
        setup.inbox.post(
          blankItem({
            kind: 'message',
            title: notice.title,
            body: notice.body,
            tone: notice.tone,
            source: runtime.manifest.name,
            actions: notice.link
              ? [action('open', { label: 'Open', value: notice.link, primary: true })]
              : [],
          }),
        )
      },
      openUrl: (url) => {
        openExternalWeb(url)

        return Promise.resolve()
      },
      clipboard: { read: () => clipboard.readText(), write: (text) => clipboard.writeText(text) },
      workstation,
      fetch: extensionFetch,
      run: runProgram,
      trash: (path) => shell.trashItem(path),
    },
    asks: new WindowAsks({
      dialog: (request) => broadcast('extensions:dialog', request),
      dialogClosed: (requestId) => broadcast('extensions:dialogClosed', { requestId }),
      editorAsk: (ask) => broadcast('extensions:editorAsk', ask),
    }),
    events: {
      changed: (state) => broadcast('extensions:changed', state),
      view: (tree) => broadcast('extensions:view', tree),
      logged: (id, entries) => broadcast('extensions:logged', { id, entries }),
      showView: (key) => broadcast('extensions:showView', { key }),
      toolsChanged: () => {
        const connector = setup.connectors
          .getState()
          .connectors.find((item) => item.kind === 'extensions')

        if (connector) void setup.connectors.refresh(connector.id)
      },
    },
  })
  const authoring = new ExtensionAuthoring({
    root: setup.root,
    converse: async (provider, dir, message) => {
      const panel = setup.panels.get(provider)

      await panel.trustProject(dir)
      await workstation.call('open_project', { project: dir })

      const id = await panel.openConversation(dir, {})

      panel.activateConversation(id)
      await panel.actions.send(id, { text: message, images: [] })
    },
    exists: (id) => service.state().extensions.some((item) => item.id === id),
    rescan: () => service.rescan(),
  })
  const shop = new ExtensionStore({
    root: setup.root,
    client: new StoreClient(process.env[STORE_URL_ENV] ?? STORE_URL, () => storeKeys(secrets)),
    extensions: service,
    store,
    secrets,
  })
  const watcher = new ExtensionsWatcher(setup.root, (ids, rescan) => {
    void (async () => {
      if (rescan) await service.rescan()

      for (const id of ids) await service.reloadIfChanged(id)
    })().catch((error: unknown) => console.warn('[extensions] перезагрузка не удалась', error))
  })

  await service.start()
  watcher.start()
  setup.panels.hooks.target = service.hooks

  return {
    service,
    authoring,
    shop,
    shutdown: async () => {
      setup.panels.hooks.target = null
      watcher.dispose()
      await service.stop()
    },
  }
}
