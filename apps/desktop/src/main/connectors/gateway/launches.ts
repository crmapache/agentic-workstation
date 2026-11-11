import { createHash, randomUUID } from 'node:crypto'
import { rm, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import { randomToken } from '../oauth/pkce'
import { writeMcpConfig, claudeMcpConfig } from './mcp-config'
import type { GatewayEntry } from './mcp-config'

/**
 * Процесс провайдера со своим ключом: проект, в котором он работает, и id для его процессов
 * команд. released - процесс кончился: вызов, который успел пройти проверку ключа раньше,
 * не должен поднять ему новый процесс команды - гасить его было бы уже некому.
 */
export type Launch = { id: string; projectPath: string; released: boolean }

/** Конфиг шлюза одного процесса: файл для `--mcp-config` и «процесс кончился». */
export type McpLaunch = { path: string; release: () => void }

const digest = (token: string): string => createHash('sha256').update(token).digest('hex')

/**
 * Ключи шлюза по процессам провайдера (ADR 0029). У каждого процесса разговора свой
 * случайный ключ, и по нему шлюз знает проект: ключ одного проекта не вычислить из пути
 * другого. Это фильтр видимости, а не песочница: файл конфига чужого процесса лежит в
 * userData того же пользователя, и процесс с Bash его прочтёт. Ключи хранятся хешами:
 * поиск по хешу не выдаёт сам ключ временем ответа.
 */
export class GatewayLaunches {
  private readonly launches = new Map<string, Launch & { file: string }>()

  constructor(
    private readonly dir: string,
    /** Процесс кончился: его процессы команд больше не нужны. */
    private readonly released: (launchId: string) => void,
  ) {}

  /** Файлы прошлых запусков IDE: их ключи шлюз уже не примет, а лежать им незачем. */
  async clear(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true })
  }

  /** Выдать процессу ключ и записать его конфиг. Не записался - ключ не выдан. */
  async issue(projectPath: string, entries: readonly GatewayEntry[]): Promise<McpLaunch> {
    const token = randomToken()
    const key = digest(token)
    const id = randomUUID()
    const file = join(this.dir, `${id}.json`)

    this.launches.set(key, { id, projectPath, released: false, file })

    try {
      await writeMcpConfig(file, claudeMcpConfig(entries, token))
    } catch (error) {
      this.launches.delete(key)
      throw error
    }

    return { path: file, release: () => this.release(key) }
  }

  find(token: string): Launch | null {
    return this.launches.get(digest(token)) ?? null
  }

  private release(key: string): void {
    const launch = this.launches.get(key)

    if (!launch) return

    this.launches.delete(key)
    launch.released = true
    void unlink(launch.file).catch(() => undefined)
    this.released(launch.id)
  }
}
