import { openKeyStore } from '../remote/keystore-idb'
import type { WorkerScope, WorkerConfig } from './sw.types'
import { installServiceWorker } from './worker'

/**
 * Вход сервис-воркера. Собирается отдельным файлом sw.js (build/pwa.ts, без общих кусков со
 * страницей: воркер - классический скрипт), и имя кэша, файлы оболочки и слова уведомлений
 * сборка подставляет вместо __SW_CONFIG__.
 */

declare const __SW_CONFIG__: WorkerConfig

installServiceWorker(self as unknown as WorkerScope, __SW_CONFIG__, {
  machines: async () => (await openKeyStore()).loadMachines(),
})
