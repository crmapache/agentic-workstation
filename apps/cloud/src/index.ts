import { configFromEnv } from './config.ts'
import { createCloud } from './server.ts'

/** Запуск облака в контейнере или локально (`pnpm --filter @agentic-workstation/cloud dev`). */
const config = configFromEnv(process.env)
const log = (line: string) => console.log(`[cloud] ${line}`)
const cloud = createCloud(config, log)
const port = await cloud.listen(config.port)

log(`слушаю порт ${port}, данные - ${config.dataDir}`)

const stop = () => {
  void cloud.close().then(() => process.exit(0))
}

process.on('SIGTERM', stop)
process.on('SIGINT', stop)
