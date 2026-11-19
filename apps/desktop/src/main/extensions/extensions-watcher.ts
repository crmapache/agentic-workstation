import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { sep } from 'node:path'

/** Тишина после правок, прежде чем перезагружать: ИИ пишет файлы пачкой. */
const QUIET_MS = 400

/**
 * Слежение за папкой расширений (ADR 0091): правка файлов расширения - его перезагрузка, новая
 * или удалённая папка - пересмотр корня. Так ИИ видит свою правку сразу, без кнопки.
 */
export class ExtensionsWatcher {
  private watcher: FSWatcher | null = null
  private readonly changed = new Set<string>()
  private rescan = false
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly root: string,
    private readonly onChange: (ids: string[], rescan: boolean) => void,
  ) {}

  start(): void {
    try {
      this.watcher = watch(this.root, { recursive: true }, (_event, name) => this.noted(name))
      this.watcher.on('error', (error) =>
        console.warn('[extensions] слежение за папкой оборвалось', error),
      )
    } catch (error) {
      console.warn('[extensions] за папкой расширений не уследить', error)
    }
  }

  dispose(): void {
    this.watcher?.close()
    this.watcher = null

    if (this.timer) clearTimeout(this.timer)
  }

  private noted(name: string | Buffer | null) {
    const path = name === null ? '' : String(name)
    const [id] = path.split(sep)

    if (!id || !path.includes(sep)) this.rescan = true
    else this.changed.add(id)

    if (this.timer) clearTimeout(this.timer)

    this.timer = setTimeout(() => {
      const ids = [...this.changed]
      const rescan = this.rescan

      this.timer = null
      this.changed.clear()
      this.rescan = false
      this.onChange(ids, rescan)
    }, QUIET_MS)
  }
}
