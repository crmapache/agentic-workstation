import { join } from 'node:path'

import type { ExtensionActionError } from '@shared/extensions'
import type { ProviderId } from '@shared/providers'
import { PROVIDER_IDS } from '@shared/providers'

import { writeGuides, extensionIdFor, scaffoldExtension } from './scaffold'

/** Что работе с ИИ над расширением нужно от IDE. */
export type AuthoringDeps = {
  root: string
  /**
   * Разговор в папке расширения: папка - проектом IDE и доверена панели (её создала сама IDE,
   * как дом), новая вкладка выбранного провайдера - на виду, с первым сообщением.
   */
  converse: (provider: ProviderId, dir: string, message: string) => Promise<void>
  /** Есть ли такое расширение (папка с манифестом). */
  exists: (id: string) => boolean
  /** Корень перечитан: новое расширение - в списке сразу. */
  rescan: () => Promise<void>
}

/** Первое сообщение разговора: что строим, где руководство и как проверить. */
const createPrompt = (name: string, request: string): string =>
  [
    `Build an Agentic Workstation extension "${name}" in this folder.`,
    '',
    'What the person wants:',
    request,
    '',
    'First read AGENTS.md and ide.d.ts in this folder: they are the whole extension API, its permissions and limits. A working starter is already here (extension.json, main.js, README.md) - replace it.',
    'The IDE reloads the extension on every save. When the code is ready, check it with the Agentic Workstation connector tools: list_extensions (status and problem), extension_logs (errors), run_extension_command. Fix until it runs without errors.',
    'Ask only for the permissions the code really uses. Then tell me in plain words what the extension does, how to use it, and which permissions I need to approve in Extensions.',
  ].join('\n')

const editPrompt = (name: string, request: string): string =>
  [
    `Change the Agentic Workstation extension "${name}" in this folder.`,
    '',
    'What the person wants:',
    request,
    '',
    'Read AGENTS.md and ide.d.ts first. After the change, check it with list_extensions and extension_logs, and bump "version" in extension.json. Tell me what changed and whether I need to approve new permissions.',
  ].join('\n')

/**
 * Расширение с ИИ (ADR 0091): папка-заготовка, папка - проектом IDE, новый разговор выбранного
 * провайдера с просьбой человека. Дальше работает обычный разговор: ИИ пишет файлы, IDE сама
 * перезагружает расширение, а проверяет он себя инструментами workstation.
 */
export class ExtensionAuthoring {
  constructor(private readonly deps: AuthoringDeps) {}

  async create(
    name: string,
    request: string,
    provider: string,
  ): Promise<ExtensionActionError | null> {
    const cleanName = name.trim().slice(0, 60)
    const wish = request.trim().slice(0, 20_000)

    if (!cleanName || !wish) return 'invalid-name'
    if (!isProvider(provider)) return 'no-provider'

    const id = extensionIdFor(cleanName, (candidate) => this.deps.exists(candidate))
    const description = wish.split('\n')[0]?.slice(0, 200) ?? ''

    try {
      const dir = await scaffoldExtension(this.deps.root, id, { name: cleanName, description })

      await this.deps.rescan()
      await this.converse(provider, dir, createPrompt(cleanName, wish))
    } catch (error) {
      console.warn('[extensions] расширение с ИИ не началось', error)

      return 'io'
    }

    return null
  }

  async edit(
    id: string,
    name: string,
    request: string,
    provider: string,
  ): Promise<ExtensionActionError | null> {
    const wish = request.trim().slice(0, 20_000)

    if (!this.deps.exists(id)) return 'not-found'
    if (!wish) return 'invalid-name'
    if (!isProvider(provider)) return 'no-provider'

    const dir = join(this.deps.root, id)

    try {
      // Руководство - всегда свежее: API могло вырасти с тех пор, как расширение создано.
      await writeGuides(dir)
      await this.converse(provider, dir, editPrompt(name, wish))
    } catch (error) {
      console.warn('[extensions] правка с ИИ не началась', error)

      return 'io'
    }

    return null
  }

  private converse(provider: ProviderId, dir: string, message: string) {
    return this.deps.converse(provider, dir, message)
  }
}

const isProvider = (value: string): value is ProviderId =>
  (PROVIDER_IDS as readonly string[]).includes(value)
