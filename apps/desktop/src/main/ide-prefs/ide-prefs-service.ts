import { join } from 'node:path'

import type { IdePrefs } from '@shared/ide-prefs'
import { parseIdePrefs, legacyIdePrefs } from '@shared/ide-prefs'

import { broadcast } from '../ipc/broadcast'
import { JsonFile } from '../storage/json-file'

/**
 * Общие настройки IDE (Settings): сворачивание вставки в поле любого провайдера, кто пишет
 * сообщение коммита. Владелец - здесь, на диске - свой файл, окну - событием после каждой правки.
 * Работы спрашивают значение в момент работы: правка действует сразу, без перезапуска.
 */
export class IdePrefsService {
  /** Записи по очереди: две подряд писали бы один временный файл разом. */
  private writing: Promise<void> = Promise.resolve()

  private constructor(
    private current: IdePrefs,
    private readonly file: JsonFile<IdePrefs>,
    private readonly onChange: (value: IdePrefs) => void,
  ) {}

  /**
   * Свои настройки с диска. Файла нет - сворачивание вставки переезжает из настроек панели
   * Claude Code (claude.json), где жило до общих настроек; переезд пишется сразу.
   */
  static async load(
    file: JsonFile<IdePrefs>,
    claudeFile: JsonFile<unknown>,
    onChange: (value: IdePrefs) => void,
  ): Promise<IdePrefsService> {
    const stored = await file.read()

    if (stored !== null) return new IdePrefsService(parseIdePrefs(stored), file, onChange)

    const moved = legacyIdePrefs(await claudeFile.read())
    const service = new IdePrefsService(parseIdePrefs(moved), file, onChange)

    if (moved) {
      await file
        .write(service.current)
        .catch((error: unknown) => console.warn('[ide-prefs] перенос не записан:', error))
    }

    return service
  }

  /** Файл настроек в данных IDE; каждая правка - окну событием. */
  static open(userData: string): Promise<IdePrefsService> {
    return IdePrefsService.load(
      new JsonFile<IdePrefs>(join(userData, 'ide-prefs.json')),
      new JsonFile<unknown>(join(userData, 'claude.json')),
      (value) => broadcast('idePrefs:changed', value),
    )
  }

  get value(): IdePrefs {
    return this.current
  }

  /**
   * Правка из окна поверх нынешних: негодное поле отбрасывается, а не пишется. В работу встаёт
   * только записанное: не записалось - работа идёт на прежнем, окно видит ошибку.
   */
  async set(patch: unknown): Promise<IdePrefs> {
    const next = parseIdePrefs(patch, this.current)

    this.writing = this.writing.catch(() => undefined).then(() => this.file.write(next))
    await this.writing
    this.current = next
    this.onChange(next)

    return next
  }
}
