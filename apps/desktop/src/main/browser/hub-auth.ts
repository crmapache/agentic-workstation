import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { Socket } from 'node:net'
import { join } from 'node:path'

import {
  AUTH_OK,
  proofOf,
  AUTH_HUB,
  newNonce,
  AUTH_HOST,
  sameProof,
  newBridgeKey,
} from '@agentic-workstation/browser-protocol/bridge-auth'

/** Файл ключа моста в папке host - её видит только этот человек. */
export const BRIDGE_KEY_FILE = 'bridge.key'

/** Длиннее первой строки проверки host не шлёт: дальше - чужой поток. */
const AUTH_LINE_MAX = 512

/**
 * Ключ моста (ADR 0048): прочитать из папки host или создать. Один на установку: host, уже
 * запущенный Chrome, читал его на старте, и новый ключ на каждом запуске IDE разорвал бы его.
 */
export const ensureBridgeKey = async (hostDir: string): Promise<{ key: string; path: string }> => {
  const path = join(hostDir, BRIDGE_KEY_FILE)
  const stored = (await readFile(path, 'utf8').catch(() => '')).trim()

  if (stored) return { key: stored, path }

  const key = newBridgeKey()

  await mkdir(hostDir, { recursive: true, mode: 0o700 })
  await writeFile(path, key, { mode: 0o600 })

  return { key, path }
}

/**
 * Проверить host до первого кадра (bridge-auth.ts): IDE шлёт своё число, host отвечает
 * доказательством и своим числом, IDE доказывает себя в ответ. Не тот ключ, чужая строка или
 * молчание дольше timeoutMs - false. host до ответа IDE ничего больше не шлёт, так что после
 * первой строки в сокете пусто, и связь отдаётся дальше (HubLink) без потерь.
 */
export const authenticateHost = (
  socket: Socket,
  key: string,
  timeoutMs: number,
): Promise<boolean> =>
  new Promise((resolve) => {
    const nonce = newNonce()
    let buffer = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = (ok: boolean) => {
      if (settled) return

      settled = true
      if (timer) clearTimeout(timer)
      socket.off('data', handleData)
      socket.off('close', handleClose)
      resolve(ok)
    }
    const handleClose = () => finish(false)
    // Первая строка host - его ответ; дальше до «auth-ok» он молчит, поэтому строку берём одну
    // и больше сокет не читаем: остальное - уже дело HubLink.
    const handleData = (chunk: string) => {
      buffer += chunk

      const end = buffer.indexOf('\n')

      if (end >= 0) {
        socket.off('data', handleData)
        void answer(buffer.slice(0, end))
      } else if (buffer.length > AUTH_LINE_MAX) {
        finish(false)
      }
    }
    const answer = async (line: string) => {
      const [kind, proof, hostNonce] = line.split(' ')
      const isHost =
        kind === AUTH_HOST &&
        Boolean(proof && hostNonce) &&
        sameProof(proof ?? '', await proofOf(key, 'host', nonce))

      if (!isHost || !hostNonce || settled) {
        finish(false)

        return
      }

      socket.write(`${AUTH_OK} ${await proofOf(key, 'hub', hostNonce)}\n`)
      finish(true)
    }

    timer = setTimeout(() => finish(false), timeoutMs)
    socket.setEncoding('utf8')
    socket.on('data', handleData)
    socket.once('close', handleClose)
    socket.write(`${AUTH_HUB} ${nonce}\n`)
  })
