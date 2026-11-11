import type { LockedFile } from './locked-file'

/** Сколько id помнить: хвост новейших, старые прогоны давно ушли из списка истории. */
const LIMIT = 4_000

/**
 * Разговоры, которые панель подняла сама для прогонов (голова и карточки), - книжка проекта
 * (ScenarioConversations в ACC). По ней их нет ни в истории, ни в поиске по разговорам:
 * прогон - дюжина обычных разговоров CLI, и список прошлых они занимали больше чем наполовину.
 * Нет файла - книжка заводится из записей прогонов один раз.
 */
export class HiddenBook {
  private known: Set<string> | null = null

  constructor(
    private readonly file: LockedFile,
    private readonly past: () => Promise<string[]>,
  ) {}

  async all(): Promise<ReadonlySet<string>> {
    this.known ??= await this.file.underLock(async () => new Set((await this.read()) ?? []))

    return this.known
  }

  async note(id: string): Promise<void> {
    if (!id || this.known?.has(id)) return

    await this.file.underLock(async () => {
      const known = await this.read()

      if (!known) return

      const ids = known.includes(id) ? known : await this.write([...known, id])

      this.known = new Set(ids)
    })
  }

  /** Разговор головы открыли обычной вкладкой - теперь он разговор человека. */
  async release(id: string): Promise<void> {
    await this.file.underLock(async () => {
      const known = await this.read()

      if (!known?.includes(id)) return

      this.known = new Set(await this.write(known.filter((one) => one !== id)))
    })
  }

  private async read(): Promise<string[] | null> {
    const stored = await this.file.read()

    if (stored.kind === 'missing') {
      const found = await this.past().catch(() => [])

      return found.length > 0 ? this.write(found) : []
    }

    if (stored.kind === 'unreadable') return null

    try {
      const { ids } = JSON.parse(stored.text) as { ids?: unknown }

      return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : null
    } catch {
      return null
    }
  }

  private async write(ids: string[]): Promise<string[]> {
    const kept = [...new Set(ids)].slice(-LIMIT)

    await this.file.put(JSON.stringify({ ids: kept }))

    return kept
  }
}
