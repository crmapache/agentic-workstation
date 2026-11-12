import { webUtils, ipcRenderer, contextBridge } from 'electron'
import type { IpcRendererEvent } from 'electron'

import type { IdeBridge } from '@shared/ipc/bridge'
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '@shared/ipc/contract'
import type { EventChannel, InvokeChannel } from '@shared/ipc/contract'

/**
 * Мост между окном и главным процессом. Окно работает в песочнице и без Node:
 * всё, что оно может, - это вызвать канал из контракта или подписаться на событие
 * из контракта. Чужие имена каналов отсекаются здесь, до главного процесса.
 */

const invokeChannels = new Set<string>(INVOKE_CHANNELS)
const eventChannels = new Set<string>(EVENT_CHANNELS)

// Типы контракта проверяются там, где канал вызывают (lib/ipc.ts) и где его
// обрабатывают (main/ipc/handle.ts). Здесь значения только проходят насквозь,
// поэтому реализация нетипизированная и приводится к мосту один раз.
const bridge = {
  invoke: (channel: InvokeChannel, request: unknown) => {
    if (!invokeChannels.has(channel)) {
      return Promise.reject(new Error(`Неизвестный канал IPC: ${channel}`))
    }

    return ipcRenderer.invoke(channel, request)
  },

  on: (event: EventChannel, listener: (payload: unknown) => void) => {
    if (!eventChannels.has(event)) {
      throw new Error(`Неизвестное событие IPC: ${event}`)
    }

    const forward = (_event: IpcRendererEvent, payload: unknown) => listener(payload)

    ipcRenderer.on(event, forward)

    return () => {
      ipcRenderer.removeListener(event, forward)
    }
  },

  // Путь перетащенного файла знает только preload: окну в песочнице он не виден.
  pathForFile: (file: File) => webUtils.getPathForFile(file),

  platform: process.platform,
} as IdeBridge

contextBridge.exposeInMainWorld('ide', bridge)
