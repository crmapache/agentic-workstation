import { join } from 'node:path'

import type { VoiceSettings } from '@shared/voice'

import { broadcast } from '../ipc/broadcast'
import { ELECTRON_CIPHER } from '../storage/electron-cipher'
import { JsonFile } from '../storage/json-file'
import { Vault } from '../storage/vault'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { ConversationsPort } from '../remote/bridge/bridge-ports'
import { realTimer, VoiceService } from './voice-service'
import { VoiceStore } from './voice-store'
import { dialDeepgram, checkDeepgramKey } from './deepgram/deepgram-link'

export type VoiceRuntime = { service: VoiceService; store: VoiceStore }

/**
 * Голосовой режим IDE (ADR 0104): настройки в `voice.json`, ключ Deepgram в `voice.vault`,
 * звонок - через порты панелей, в проекте Home. Окну - событием после каждой перемены.
 */
export const startVoice = async (setup: {
  dataDir: string
  workspace: WorkspaceService
  panels: () => readonly ConversationsPort[]
}): Promise<VoiceRuntime> => {
  const store = await VoiceStore.load(
    new JsonFile<VoiceSettings>(join(setup.dataDir, 'voice.json')),
    await Vault.load(join(setup.dataDir, 'voice.vault'), ELECTRON_CIPHER),
  )
  const service = new VoiceService({
    store,
    panels: setup.panels,
    homePath: () =>
      setup.workspace.getState().projects.find((project) => project.home)?.rootPath ?? null,
    dial: dialDeepgram,
    timer: realTimer,
    now: () => Date.now(),
    checkKey: (key, region) => checkDeepgramKey(key, region),
    onView: (view) => broadcast('voice:changed', view),
  })

  return { service, store }
}
