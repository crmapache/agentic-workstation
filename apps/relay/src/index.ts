import { readConfig, RELAY_VERSION } from './config.ts'
import { createRelay } from './server.ts'

/**
 * Запуск релея. Всё, что он делает, - в server.ts; здесь только решение начать, чтобы тест
 * поднимал свой релей без запуска на импорте.
 */

const config = readConfig()

/** Строка журнала - только что случилось, четыре байта адреса, размер, время. Никогда тело. */
const log = (line: string): void => {
  if (config.logLevel !== 'silent') process.stdout.write(`${new Date().toISOString()} ${line}\n`)
}

const relay = createRelay(config, log)

void relay.listen(config.port).then((port) => {
  log(`relay ${RELAY_VERSION} listening on ${port}`)
  log(config.push ? 'push on' : `push off: ${config.pushOff}`)
})

/** Coolify гасит контейнер SIGTERM: закрыть сокеты и выйти, а не ждать SIGKILL. */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void relay.close().then(() => process.exit(0))
  })
}
