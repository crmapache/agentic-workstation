import type { UsageWindow, AccountUsage } from '@shared/account-usage'

import type { JsonFile } from '../storage/json-file'
import type { AcpAgent } from './acp-agent'

/** Окно просит лимиты раз в пару минут, а сервер агента спрашивается не чаще этого шага. */
const USAGE_STEP_MS = 60_000

/** После хода цифры нужны свежими (лимит мог кончиться на нём), но не чаще этого. */
const USAGE_AFTER_TURN_MS = 15_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isWindow = (value: unknown): value is UsageWindow =>
  isRecord(value) &&
  typeof value['group'] === 'string' &&
  typeof value['model'] === 'string' &&
  typeof value['percent'] === 'number' &&
  (value['resetsAt'] === null || typeof value['resetsAt'] === 'number') &&
  typeof value['severity'] === 'string'

/** Цифры с диска; чужое или битое - null. */
export const parseUsage = (value: unknown): AccountUsage | null => {
  if (!isRecord(value) || !Array.isArray(value['windows'])) return null
  if (typeof value['fetchedAt'] !== 'number' || !value['windows'].every(isWindow)) return null

  const extra = value['extra']
  const percent = isRecord(extra) ? extra['percent'] : null

  return {
    windows: value['windows'],
    extra: isRecord(extra) ? { percent: typeof percent === 'number' ? percent : null } : null,
    fetchedAt: value['fetchedAt'],
  }
}

/**
 * Лимиты подписки агента ACP - кольцами под полем, как у Claude и Codex (ADR 0092). По ACP их нет:
 * спрашивает драйвер агента сам (`AcpAgent.usage`, у Kimi - сервер подписки его же входом), а он
 * может ответить только пока у агента живой вход (Kimi обновляет токен сам, на своих запросах).
 * Поэтому последние цифры живут на диске: после перезапуска IDE кольца стоят с давностью цифр, а
 * окно, чей сброс прошёл, - пустым. Вопрос, который уже идёт, не повторяется.
 */
export class AcpUsage {
  private usage: AccountUsage | null = null
  private askedAt = 0
  private asking: Promise<void> | null = null

  constructor(
    private readonly agent: Pick<AcpAgent, 'usage'>,
    /** Где лежат последние цифры между запусками IDE. */
    private readonly file: JsonFile<AccountUsage | null>,
    /** Цифры поменялись: окну - новым состоянием. */
    private readonly changed: () => void,
  ) {
    if (!agent.usage) return

    void file
      .read()
      .then((stored) => {
        const usage = parseUsage(stored)

        if (!usage || this.usage) return

        this.usage = usage
        this.changed()
      })
      .catch((error: unknown) => console.warn('[acp] лимиты с диска не прочитаны:', error))
  }

  /** Лимиты для окна под id аккаунта панели (у агента ACP он один - пустой). */
  view(): Record<string, AccountUsage> {
    return this.usage ? { '': this.usage } : {}
  }

  /** По просьбе окна: не чаще шага. */
  refresh(): Promise<void> {
    return this.ask(USAGE_STEP_MS)
  }

  /** Ход кончился: расход изменился, а лимит мог кончиться на нём. */
  afterTurn(): void {
    void this.ask(USAGE_AFTER_TURN_MS)
  }

  /** Вышли из аккаунта: чужие цифры не показывать. */
  forget(): void {
    this.usage = null
    this.askedAt = 0
    this.save()
    this.changed()
  }

  private save(): void {
    void this.file.write(this.usage).catch((error: unknown) => {
      console.warn('[acp] лимиты на диск не записаны:', error)
    })
  }

  private ask(step: number): Promise<void> {
    const { usage } = this.agent

    if (this.asking) return this.asking
    if (!usage || Date.now() - this.askedAt < step) return Promise.resolve()

    this.askedAt = Date.now()

    const asking = usage()
      .then((next) => {
        if (!next) return

        this.usage = next
        this.save()
        this.changed()
      })
      .catch((error: unknown) => console.warn('[acp] лимиты не получены:', error))
      .finally(() => {
        this.asking = null
      })

    this.asking = asking

    return asking
  }
}
