import { parentPort, workerData } from 'node:worker_threads'

import { StatsEngine } from '../stats-engine'
import type { WorkerData, WorkerInbound, WorkerOutbound } from './engine-link'

/**
 * Поток статистики: единственный, кто открывает базу. Запросы идут вперемешку - выборка,
 * пришедшая во время первого прохода, отвечается между его кусками (timed-batch.ts).
 */
const port = parentPort

if (port) {
  const post = (message: WorkerOutbound) => port.postMessage(message)
  let engine: StatsEngine | null = null
  let failure = ''

  try {
    engine = new StatsEngine((workerData as WorkerData).dbPath, (progress) =>
      post({ type: 'progress', progress }),
    )
  } catch (error) {
    // База не открылась (новее схемы, испорчена): каждый запрос получит причину, поток жив.
    failure = String(error)
    console.warn('[statistics] engine failed to open', error)
  }

  port.on('message', (message: WorkerInbound) => {
    const current = engine

    if (!current) return post({ type: 'reply', id: message.id, ok: false, error: failure })

    current.handle(message.request).then(
      (result) => post({ type: 'reply', id: message.id, ok: true, result }),
      (error: unknown) => post({ type: 'reply', id: message.id, ok: false, error: String(error) }),
    )
  })
}
