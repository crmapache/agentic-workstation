import type { ModelInfo } from '@shared/conversation'

import { canRunModel, catalogNames } from './model-catalog'

/**
 * Каталоги моделей по аккаунтам - в памяти, не на диске (как ClaudeAccounts.catalogues в
 * ACC): это то, что CLI сказал минуту назад, а не факт о человеке. Нужен для одного -
 * решить до подъёма процесса, может ли аккаунт модель (model-catalog.ts). Спрашивается на
 * рождении разговора и на открытии экрана аккаунтов - мимо которого аккаунт не сменить.
 */
export class AccountCatalogs {
  private readonly names = new Map<string, readonly string[]>()
  /** Вопрос о каталоге аккаунта уже в пути: второй не задаётся. */
  private readonly asking = new Set<string>()

  /** Каталог, каким его ответил аккаунт. Пустой ответ ничего не стирает. */
  note(accountId: string, models: readonly ModelInfo[]): void {
    const names = catalogNames(models)

    if (names.length > 0) this.names.set(accountId, names)
  }

  /** Может ли аккаунт модель: null - его каталог ещё не спрашивали. */
  canRun(accountId: string, model: string, customModels: readonly string[]): boolean | null {
    return canRunModel(this.names.get(accountId) ?? null, model, customModels)
  }

  /** Спросить каталог аккаунта, если его ещё нет: раз на аккаунт, пока он помнится. */
  async learn(accountId: string, ask: () => Promise<readonly ModelInfo[]>): Promise<void> {
    if (this.names.has(accountId) || this.asking.has(accountId)) return

    this.asking.add(accountId)

    try {
      this.note(accountId, await ask())
    } catch {
      // Не ответил - спросим в следующий раз.
    } finally {
      this.asking.delete(accountId)
    }
  }

  /** Аккаунт забыт или его вход заменён: прежний ответ о нём больше не верен. */
  forget(accountId: string): void {
    this.names.delete(accountId)
  }
}
