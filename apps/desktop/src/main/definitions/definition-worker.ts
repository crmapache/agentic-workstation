import { DefinitionEngine } from './definition-engine'
import type { WorkerInbound, WorkerOutbound } from './definition.types'

/**
 * Служебный процесс определений (utilityProcess): компилятор TypeScript и разобранные файлы
 * живут здесь, а не в главном процессе - разбор большого файла не задерживает ни IPC, ни окно, а
 * выгрузка после простоя отдаёт системе всю память (поток в главном процессе оставлял её там).
 * Вопросы идут по одному.
 */
const port = process.parentPort
const engine = new DefinitionEngine()

port.on('message', ({ data }: { data: WorkerInbound }) => {
  let reply: WorkerOutbound

  try {
    reply = { id: data.id, ok: true, answer: engine.find(data.job) }
  } catch (error) {
    reply = { id: data.id, ok: false, error: String(error) }
  }

  port.postMessage(reply)
})
