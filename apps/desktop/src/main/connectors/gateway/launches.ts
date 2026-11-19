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
 * Ключ шлюза одного процесса. own - назвать разговор процесса; зовётся сразу после выдачи
 * ключа, до подъёма CLI, - вызовов по ключу ещё нет. release - процесс кончился (разговор
 * может поднять следующий), idle - работа разговора встала (ни хода, ни фоновых агентов),
 * end - кончился сам разговор: его вкладку закрыли. idle и end можно звать и после release -
 * разговор переживает свои процессы.
 */
export type GatewayLaunch = {
  /** Серверы шлюза для процесса - у провайдера, который берёт их флагами запуска (Codex). */
  servers: readonly GatewayEntry[]
  /** Ключ процесса: у такого провайдера - только в памяти и окружении процесса, не на диске. */
  token: string
  /**
   * Правила «разрешено всегда» для CLI (`--allowedTools`): серверы IDE, о которых человека
   * спрашивать незачем, - уведомления самому себе (ADR 0069).
   */
  allowed: readonly string[]
  own: (owner: LaunchOwner) => void
  release: () => void
  idle: () => void
  end: () => void
}

/** Ключ шлюза с файлом для `--mcp-config` (Claude Code): ключ - внутри файла. */
export type McpLaunch = GatewayLaunch & { path: string }

const digest = (token: string): string => createHash('sha256').update(token).digest('hex')

/**
 * Ключи шлюза по процессам провайдера (ADR 0029). У каждого процесса разговора свой
 * случайный ключ, и по нему шлюз знает проект: ключ одного проекта не вычислить из пути
 * другого. Это фильтр видимости, а не песочница: файл конфига чужого процесса лежит в
 * userData того же пользователя, и процесс с Bash его прочтёт. Ключи хранятся хешами:
 * поиск по хешу не выдаёт сам ключ временем ответа.
 */
export class GatewayLaunches {
  private readonly launches = new Map<string, Launch & { file: string | null }>()

  constructor(
    private readonly dir: string,
    /** Процесс кончился: его процессы команд больше не нужны. */
    private readonly released: (launch: Launch) => void,
    /** Работа разговора встала: показывать человеку работу агента больше нечего. */
    private readonly idled: (conversationId: string) => void,
    /** Разговор закрыт насовсем: держать для него больше нечего. */
    private readonly ended: (conversationId: string) => void,
  ) {}

  /** Файлы прошлых запусков IDE: их ключи шлюз уже не примет, а лежать им незачем. */
  async clear(): Promise<void> {
    await rm(this.dir, { recursive: true, force: true })
  }

  /** Выдать процессу ключ и записать его конфиг. Не записался - ключ не выдан. */
  async issue(
    projectPath: string,
    entries: readonly GatewayEntry[],
    allowed: readonly string[] = [],
  ): Promise<McpLaunch> {
    const token = randomToken()
    const file = join(this.dir, `${randomUUID()}.json`)
    const launch = this.register(projectPath, entries, allowed, token, file)

    try {
      await writeMcpConfig(file, claudeMcpConfig(entries, token))
    } catch (error) {
      // Процесс с этим ключом не поднимется: снять молча, как будто не выдавали.
      this.launches.delete(digest(token))
      throw error
    }

    return { ...launch, path: file }
  }

  /** Выдать ключ без файла - процессу, который берёт серверы флагами, а ключ из окружения. */
  issueInMemory(
    projectPath: string,
    entries: readonly GatewayEntry[],
    allowed: readonly string[] = [],
  ): GatewayLaunch {
    return this.register(projectPath, entries, allowed, randomToken(), null)
  }

  find(token: string): Launch | null {
    return this.launches.get(digest(token)) ?? null
  }

  private register(
    projectPath: string,
    servers: readonly GatewayEntry[],
    allowed: readonly string[],
    token: string,
    file: string | null,
  ): GatewayLaunch {
    const key = digest(token)
    const launch = {
      id: randomUUID(),
      projectPath,
      workDir: projectPath,
      conversationId: null as string | null,
      released: false,
      file,
    }

    this.launches.set(key, launch)

    return {
      servers,
      token,
      allowed,
      own: ({ conversationId, workDir }) => {
        launch.conversationId = conversationId
        launch.workDir = workDir
      },
      release: () => this.release(key),
      idle: () => {
        if (launch.conversationId) this.idled(launch.conversationId)
      },
      end: () => {
        if (launch.conversationId) this.ended(launch.conversationId)
      },
    }
  }

  private release(key: string): void {
    const launch = this.launches.get(key)

    if (!launch) return

    this.launches.delete(key)
    launch.released = true
    if (launch.file) void unlink(launch.file).catch(() => undefined)
    this.released(launch)
  }
}
