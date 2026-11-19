import type { ExtensionViewTree } from '@shared/extension-ui'
import type { ExtensionsState, ExtensionLogEntry } from '@shared/extensions'

import type { ExtensionStorage } from './extension-storage'
import type { ExtensionsStore } from './extensions-store'
import type { WindowAsks } from './window-asks'
import type { EngineEvents, ExtensionEngine } from './engine/extension-engine'
import type { HostContext } from './host/host-types'

/** Что из IDE расширениям даёт сборка (`extensions-setup.ts`): проекты, уведомления, сеть... */
export type IdeLink = Pick<
  HostContext,
  'projects' | 'notify' | 'openUrl' | 'clipboard' | 'workstation' | 'fetch' | 'run' | 'trash'
>

/** Секреты настроек: хранилище ключей IDE. */
export type ExtensionSecrets = {
  get: (key: string) => string | null
  set: (key: string, value: string | null) => Promise<void>
  forgetPrefix: (prefix: string) => Promise<void>
}

/** Куда сервис сообщает: окну и коннектору инструментов. */
export type ExtensionsEvents = {
  changed: (state: ExtensionsState) => void
  view: (tree: ExtensionViewTree) => void
  logged: (id: string, entries: ExtensionLogEntry[]) => void
  showView: (key: string) => void
  /** Поменялся набор инструментов для ИИ: коннектор extensions перечитает список. */
  toolsChanged: () => void
}

export type ExtensionsDeps = {
  root: string
  store: ExtensionsStore
  storage: ExtensionStorage
  secrets: ExtensionSecrets
  engine: (events: EngineEvents) => ExtensionEngine
  ide: IdeLink
  asks: WindowAsks
  events: ExtensionsEvents
}
