import type { Conversation, RefusedModes, PermissionMode } from '@shared/conversation'
import { isModeOff, modeAvailability } from '@shared/conversation'

/** Сколько прочитанный запрет bypass годится для списка машины и состояния разговора. */
export const MODES_FRESH_MS = 30_000

/** Прочитанное по проекту: запрет bypass (undefined - прочесть не вышло) и когда прочли. */
type Known = { disabled: boolean | undefined; at: number }

/** Что о режимах знает панель провайдера - то же, по чему меню MODE её вкладки гасит режимы. */
export type ModePanel = {
  /** Режимы провайдера по порядку меню MODE (capabilities.modes). */
  modes: readonly PermissionMode[]
  /** Отказы CLI перейти в режим, которые помнит панель (AgentPanelState.refusedModes). */
  refused: RefusedModes
  /**
   * Запретил ли bypass хоть один слой настроек проекта (PanelSettings.projectInfo); null - слоёв
   * настроек у провайдера нет, и bypass ими не запрещается (Codex, открытые модели).
   */
  read: ((projectPath: string) => Promise<boolean>) | null
}

export type ModeGateHost = {
  /** Панель провайдера; такой в IDE нет - null. */
  panel: (provider: string) => ModePanel | null
  /** Провайдеры IDE: у кого есть слои настроек, их читают до первого списка. */
  providers: () => readonly string[]
  /** Прочитанное поменялось: телефонам - новый список и состояние разговора. */
  changed: () => void
  now?: () => number
}

/**
 * Какие режимы разрешений телефон видит погашенными - то же правило, что у меню MODE окна
 * (`modeAvailability`, ADR 0076), у каждого провайдера своими режимами (ADR 0083): иначе телефон
 * предлагал бы то, что окно гасит. Режим не своего провайдера (auto у Codex, readOnly у Claude)
 * не доступен вовсе. Запрет bypass лежит в файлах настроек, а список машины и состояние разговора
 * собираются синхронно на каждую перемену IDE. Поэтому мост помнит прочитанное по провайдеру и
 * проекту и перечитывает его в фоне, когда оно старше MODES_FRESH_MS (файлы правят и руками).
 * Команда режима читает заново: решает то, что в файлах сейчас, а не полминуты назад.
 */
export class ModeGate {
  private readonly known = new Map<string, Known>()
  private readonly reading = new Map<string, Promise<boolean | undefined>>()

  constructor(private readonly host: ModeGateHost) {}

  /** Погашенные режимы разговора - как в меню MODE его вкладки. */
  offFor(provider: string, conversation: Conversation): PermissionMode[] {
    return this.off(provider, conversation.projectPath, conversation)
  }

  /** Погашенные режимы нового разговора проекта - как в меню New chats: auto не гасится. */
  offForNew(provider: string, projectPath: string): PermissionMode[] {
    return this.off(provider, projectPath, null)
  }

  /**
   * Доступен ли режим разговору провайдера (conversation null - новому разговору проекта) - по
   * свежему чтению настроек: команда решает по тому, что в файлах сейчас.
   */
  async allows(
    provider: string,
    mode: PermissionMode,
    projectPath: string,
    conversation: Conversation | null,
  ): Promise<boolean> {
    const panel = this.host.panel(provider)

    if (!panel?.modes.includes(mode)) return false

    const disabled = panel.read ? await this.load(provider, projectPath, panel.read) : false

    return !isModeOff(mode, modeAvailability(panel.refused, disabled, conversation))
  }

  /** Дождаться проектов, которых мост ещё не читал: первый ответ телефону - уже с ними. */
  async ready(projectPaths: readonly string[]): Promise<void> {
    const reads = this.host.providers().flatMap((provider) => {
      const read = this.host.panel(provider)?.read

      return read
        ? projectPaths
            .filter((path) => !this.known.has(keyOf(provider, path)))
            .map((path) => this.load(provider, path, read))
        : []
    })

    await Promise.all(reads)
  }

  private off(
    provider: string,
    projectPath: string,
    conversation: Conversation | null,
  ): PermissionMode[] {
    const panel = this.host.panel(provider)

    if (!panel) return []

    const disabled = panel.read ? this.cached(provider, projectPath, panel.read) : false
    const available = modeAvailability(panel.refused, disabled, conversation)

    return panel.modes.filter((mode) => isModeOff(mode, available))
  }

  /** Последнее прочитанное; нет его или оно старое - перечитать в фоне, перемена уйдёт следом. */
  private cached(
    provider: string,
    projectPath: string,
    read: (projectPath: string) => Promise<boolean>,
  ): boolean | undefined {
    const known = this.known.get(keyOf(provider, projectPath))

    if (!known || this.now() - known.at > MODES_FRESH_MS)
      void this.load(provider, projectPath, read)

    return known?.disabled
  }

  /** Одно чтение на проект за раз: список и команда, пришедшие вместе, его делят. */
  private load(
    provider: string,
    projectPath: string,
    read: (projectPath: string) => Promise<boolean>,
  ): Promise<boolean | undefined> {
    const key = keyOf(provider, projectPath)
    const pending = this.reading.get(key)

    if (pending) return pending

    const before = this.known.get(key)?.disabled
    const reading = read(projectPath)
      .then(
        (disabled) => disabled,
        (error: unknown) => {
          console.warn('[remote] настройки режима проекта не прочитаны:', error)

          return before
        },
      )
      .then((disabled) => {
        this.known.set(key, { disabled, at: this.now() })
        this.reading.delete(key)

        if (disabled !== before) this.host.changed()

        return disabled
      })

    this.reading.set(key, reading)

    return reading
  }

  private now(): number {
    return (this.host.now ?? Date.now)()
  }
}

/** Слои настроек - у провайдера и проекта: прочитанное одним провайдером не годится другому. */
const keyOf = (provider: string, projectPath: string): string => `${provider}\n${projectPath}`
