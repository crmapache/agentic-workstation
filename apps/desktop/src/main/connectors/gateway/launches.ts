import { createHash, randomUUID } from 'node:crypto'
import { rm, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import { randomToken } from '../oauth/pkce'
import { writeMcpConfig, claudeMcpConfig } from './mcp-config'
import type { GatewayEntry } from './mcp-config'

/**
 * Процесс провайдера со своим ключом: проект, в котором он работает, и id для его процессов
 * команд. released - процесс кончился: вызов, который успел пройти проверку ключа раньше,
 * не должен поднять ему новый процесс команды - гасить его было бы уже некому. workDir и
 * conversationId - чей это процесс (LaunchOwner); пока не названы - проект и null.
 */
export type Launch = {
  id: string
  projectPath: string
  workDir: string
  conversationId: string | null
  released: boolean
}

/**
 * Чей процесс: разговор (id вкладки панели, сессия сценария) и папка, где он работает
 * (проект, у сценария - его worktree). По разговору источник держит своё между процессами
 * одного разговора, по папке - решает, какие файлы с диска можно отдать (браузер).
 */
export type LaunchOwner = { conversationId: string; workDir: string }

/**
 * Конфиг шлюза одного процесса: файл для `--mcp-config`. own - назвать разговор процесса;
 * зовётся сразу после выдачи ключа, до подъёма CLI, - вызовов по ключу ещё нет. release -
 * процесс кончился (разговор может поднять следующий), end - кончился сам разговор: его
 * вкладку закрыли. end можно звать и после release - разговор переживает свои процессы.
 */
export type McpLaunch = {
  path: string
  own: (owner: LaunchOwner) => void
  release: () => void
  end: () => void
}

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
    private readonly released: (launch: Launch) => void,
    /** Разговор закрыт насовсем: держать для него больше нечего. */
    private readonly ended: (conversationId: string) => void,
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
    const launch = {
      id,
      projectPath,
      workDir: projectPath,
      conversationId: null as string | null,
      released: false,
      file,
    }

    this.launches.set(key, launch)

    try {
      await writeMcpConfig(file, claudeMcpConfig(entries, token))
    } catch (error) {
      this.launches.delete(key)
      throw error
    }

    return {
      path: file,
      own: ({ conversationId, workDir }) => {
        launch.conversationId = conversationId
        launch.workDir = workDir
      },
      release: () => this.release(key),
      end: () => {
        if (launch.conversationId) this.ended(launch.conversationId)
      },
    }
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
    this.released(launch)
  }
}
