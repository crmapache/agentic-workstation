import { readFileSync } from 'node:fs'
import { connect } from 'node:net'

import { HostBridge } from './host-bridge'

/**
 * Native host «браузера для ИИ» (ADR 0040). Chrome запускает его по манифесту из
 * NativeMessagingHosts: обёртка sh исполняет этот файл бинарником IDE с
 * ELECTRON_RUN_AS_NODE=1 (node у человека может не быть, а PATH у Chrome из launchd пустой).
 * Сокет IDE - аргументом --socket. В stdout - только кадры: любой лишний байт Chrome примет
 * за сломанный поток, поэтому журнал - в stderr.
 */
const argument = (name: string) => {
  const index = process.argv.indexOf(name)

  return index >= 0 ? process.argv[index + 1] : undefined
}

const socketPath = argument('--socket')

/** Ключ моста (ADR 0048): путь к файлу аргументом --key; файла нет - проверки нет. */
const key = (() => {
  const path = argument('--key')

  try {
    return path ? readFileSync(path, 'utf8').trim() || undefined : undefined
  } catch {
    return undefined
  }
})()

if (!socketPath) {
  process.stderr.write('agentic-workstation host: --socket is required\n')
  process.exit(2)
}

const bridge = new HostBridge({
  toChrome: (frame) => process.stdout.write(frame),
  connect: () => connect(socketPath),
  log: (text) => process.stderr.write(`agentic-workstation host: ${text}\n`),
  exit: (code) => process.exit(code),
  key,
})

process.stdin.on('data', (chunk: Buffer) => bridge.fromChrome(chunk))
process.stdin.on('end', () => bridge.close(0))
process.on('SIGTERM', () => bridge.close(0))
bridge.start()
