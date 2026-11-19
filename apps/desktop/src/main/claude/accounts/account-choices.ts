import { join } from 'node:path'

import type { EffortLevel } from '@shared/conversation'
import { EFFORT_LEVELS } from '@shared/conversation'

import { usableModel } from '../settings/panel-prefs'
import { JsonFile } from '../../storage/json-file'

/**
 * Чем аккаунт оставили (как в ACC): модель и усилие последнего выбора на нём. Новая
 * вкладка стартует с закреплённого в Settings, иначе с этого, иначе как выбранная
 * вкладка: модель, выбранная на Max, не должна решать, с чем стартует вкладка на Pro.
 */
export type AccountChoice = { model: string | null; effort: EffortLevel | null }

/** id аккаунта: пусто - обычный вход, иначе 16 hex. */
const ACCOUNT_ID = /^(|[0-9a-f]{16})$/

/** Выборы по аккаунтам с диска: битое и чужое отбрасывается запись за записью. */
const parseChoices = (value: unknown): Record<string, AccountChoice> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([id, entry]) => {
      if (!ACCOUNT_ID.test(id) || typeof entry !== 'object' || entry === null) return []

      const record = entry as Record<string, unknown>
      const choice: AccountChoice = {
        model: usableModel(record['model']) ?? null,
        effort: EFFORT_LEVELS.find((level) => level === record['effort']) ?? null,
      }

      return [[id, choice] as const]
    }),
  )
}

/** Выбор аккаунта поверх известного: что не названо - остаётся. */
const withChoice = (
  known: AccountChoice | undefined,
  change: Partial<AccountChoice>,
): AccountChoice => ({ model: null, effort: null, ...known, ...change })

/** Выборы по аккаунтам на диске - рядом с хранилищами входа (choices.json). */
export class AccountChoices {
  private constructor(
    private choices: Record<string, AccountChoice>,
    private readonly file: JsonFile<Record<string, AccountChoice>>,
  ) {}

  static async load(dir: string): Promise<AccountChoices> {
    const file = new JsonFile<Record<string, AccountChoice>>(join(dir, 'choices.json'))

    return new AccountChoices(parseChoices(await file.read()), file)
  }

  of(id: string): AccountChoice | undefined {
    return this.choices[id]
  }

  remember(id: string, change: Partial<AccountChoice>): void {
    this.choices = { ...this.choices, [id]: withChoice(this.choices[id], change) }
    this.file.write(this.choices).catch((error: unknown) => {
      console.warn('[claude] выбор аккаунта не сохранился:', error)
    })
  }

  /** Аккаунт забыт: его выбор уходит вместе с ним. */
  forget(id: string): void {
    if (!(id in this.choices)) return

    const { [id]: _forgotten, ...rest } = this.choices

    this.choices = rest
    void this.file.write(this.choices).catch(() => undefined)
  }
}
