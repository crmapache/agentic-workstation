import type { Conversation, RefusedModes, PermissionMode } from '@shared/claude'
import { isModeOff, modeAvailability, PERMISSION_MODES } from '@shared/claude'

/** Сколько прочитанный запрет bypass годится для списка машины и состояния разговора. */
export const MODES_FRESH_MS = 30_000

/** Прочитанное по проекту: запрет bypass (undefined - прочесть не вышло) и когда прочли. */
type Known = { disabled: boolean | undefined; at: number }

export type ModeGateHost = {
  /** Запретил ли bypass хоть один слой настроек проекта (PanelSettings.projectInfo). */
  read: (projectPath: string) => Promise<boolean>
  /** Отказы CLI перейти в режим, которые помнит панель (ClaudeState.refusedModes). */
  refused: () => RefusedModes
  /** Прочитанное поменялось: телефонам - новый список и состояние разговора. */
  changed: () => void
  now?: () => number
}

/**
 * Какие режимы разрешений телефон видит погашенными - то же правило, что у меню MODE окна
 * (`modeAvailability`, ADR 0076): иначе телефон предлагал бы то, что окно гасит. Запрет bypass
 * лежит в файлах настроек, а список машины и состояние разговора собираются синхронно на каждую
 * перемену IDE. Поэтому мост помнит прочитанное по проекту и перечитывает его в фоне, когда оно
 * старше MODES_FRESH_MS (файлы правят и руками). Команда режима читает заново: решает то, что в
 * файлах сейчас, а не полминуты назад.
 */
export class ModeGate {
  private readonly known = new Map<string, Known>()
  private readonly reading = new Map<string, Promise<boolean | undefined>>()

  constructor(private readonly host: ModeGateHost) {}

  /** Погашенные режимы разговора - как в меню MODE его вкладки. */
  offFor(conversation: Conversation): PermissionMode[] {
    return this.off(this.cached(conversation.projectPath), conversation)
  }

  /** Погашенные режимы нового разговора проекта - как в меню New chats: auto не гасится. */
  offForNew(projectPath: string): PermissionMode[] {
    return this.off(this.cached(projectPath), null)
  }

  /**
   * Доступен ли режим разговору (conversation null - новому разговору проекта) - по свежему
   * чтению настроек: команда решает по тому, что в файлах сейчас.
   */
  async allows(
    mode: PermissionMode,
    projectPath: string,
    conversation: Conversation | null,
  ): Promise<boolean> {
    const disabled = await this.load(projectPath)

    return !isModeOff(mode, modeAvailability(this.host.refused(), disabled, conversation))
  }

  /** Дождаться проектов, которых мост ещё не читал: первый ответ телефону - уже с ними. */
  async ready(projectPaths: readonly string[]): Promise<void> {
    await Promise.all(
      projectPaths.filter((path) => !this.known.has(path)).map((path) => this.load(path)),
    )
  }

  private off(disabled: boolean | undefined, conversation: Conversation | null): PermissionMode[] {
    const available = modeAvailability(this.host.refused(), disabled, conversation)

    return PERMISSION_MODES.filter((mode) => isModeOff(mode, available))
  }

  /** Последнее прочитанное; нет его или оно старое - перечитать в фоне, перемена уйдёт следом. */
  private cached(projectPath: string): boolean | undefined {
    const known = this.known.get(projectPath)

    if (!known || this.now() - known.at > MODES_FRESH_MS) void this.load(projectPath)

    return known?.disabled
  }

  /** Одно чтение на проект за раз: список и команда, пришедшие вместе, его делят. */
  private load(projectPath: string): Promise<boolean | undefined> {
    const pending = this.reading.get(projectPath)

    if (pending) return pending

    const before = this.known.get(projectPath)?.disabled
    const read = this.host
      .read(projectPath)
      .then(
        (disabled) => disabled,
        (error: unknown) => {
          console.warn('[remote] настройки режима проекта не прочитаны:', error)

          return before
        },
      )
      .then((disabled) => {
        this.known.set(projectPath, { disabled, at: this.now() })
        this.reading.delete(projectPath)

        if (disabled !== before) this.host.changed()

        return disabled
      })

    this.reading.set(projectPath, read)

    return read
  }

  private now(): number {
    return (this.host.now ?? Date.now)()
  }
}
