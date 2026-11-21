import { join } from 'node:path'

import { clipboard } from 'electron'

import { CLOUD_URL } from '@agentic-workstation/cloud-protocol/api'

import { httpTransport } from '../cloud/cloud-client'
import type { StoredCloud } from '../cloud/cloud-service'
import { CloudService } from '../cloud/cloud-service'
import { broadcast } from '../ipc/broadcast'
import type { ScenarioService } from '../scenarios/scenario-service'
import { ELECTRON_CIPHER } from '../storage/electron-cipher'
import { JsonFile } from '../storage/json-file'
import { Vault } from '../storage/vault'
import type { StoredTracker } from './tracker-book'
import { TrackerBook } from './tracker-book'
import { TrackerRuns } from './tracker-runs'
import { TrackerService } from './tracker-service'

export type TrackerRuntime = {
  tracker: TrackerService
  runs: TrackerRuns
  cloud: CloudService
  /** Выход из IDE: облако гаснет, книга ложится на диск. */
  shutdown: () => Promise<void>
}

/** Адрес облака: копия IDE для проверок может подставить свой сервер. */
const cloudUrl = () => process.env.AGENTIC_WORKSTATION_CLOUD_URL || CLOUD_URL

/**
 * Трекер задач (ADR 0101) с облаком (ADR 0102) и связкой со сценариями. Поднимается после
 * сценариев: связи карточек читают их очереди.
 */
export const startTracker = async (setup: {
  dataDir: string
  scenarios: ScenarioService
}): Promise<TrackerRuntime> => {
  const book = await TrackerBook.load(
    new JsonFile<StoredTracker>(join(setup.dataDir, 'tracker.json'), { mode: 0o600 }),
  )
  const tracker = new TrackerService({
    book,
    events: { onBoard: (board) => broadcast('tracker:changed', board) },
  })
  const runs = new TrackerRuns(tracker, {
    fetch: (projectPath, id, scope) => setup.scenarios.shelves.fetch(projectPath, id, scope),
    start: (request) => setup.scenarios.start(request),
    act: (queueId, action) => setup.scenarios.act(queueId, action),
    queues: () => setup.scenarios.queuesView().queues,
  })
  const cloud = await CloudService.load({
    vault: await Vault.load(join(setup.dataDir, 'cloud.vault'), ELECTRON_CIPHER),
    file: new JsonFile<StoredCloud>(join(setup.dataDir, 'cloud.json')),
    book,
    transportFor: (account) => httpTransport(cloudUrl(), account),
    onState: (state) => broadcast('cloud:changed', state),
    writeClipboard: async (text) => {
      await clipboard.writeText(text)
    },
  })

  return {
    tracker,
    runs,
    cloud,
    shutdown: async () => {
      cloud.close()
      await tracker.close()
    },
  }
}
