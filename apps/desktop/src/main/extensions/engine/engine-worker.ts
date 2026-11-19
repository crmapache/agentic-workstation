import { parentPort } from 'node:worker_threads'

import type { ToEngine } from './engine-protocol'
import { SandboxPool } from './sandbox-pool'

/**
 * Поток песочниц расширений (ADR 0091): собирается отдельным куском (импорт ?modulePath) и
 * живёт рядом с главным процессом. Песочницы - здесь, IDE - по ту сторону сообщений.
 */
const port = parentPort

if (port) {
  const pool = new SandboxPool((message) => port.postMessage(message))

  port.on('message', (message: ToEngine) => pool.receive(message))
}
