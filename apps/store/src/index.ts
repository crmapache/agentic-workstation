import { configFromEnv } from './config.ts'
import { createStore } from './server.ts'

/** Запуск магазина в контейнере или локально (`pnpm --filter @agentic-workstation/store dev`). */
const config = configFromEnv(process.env)
const log = (line: string) => console.log(`[store] ${line}`)
const store = createStore(config, log)
const port = await store.listen(config.port)

log(`слушаю порт ${port}, данные - ${config.dataDir}`)

const stop = () => {
  void store.close().then(() => process.exit(0))
}

process.on('SIGTERM', stop)
process.on('SIGINT', stop)
