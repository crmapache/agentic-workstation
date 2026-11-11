import type { SoundEvent, SoundPrefs } from '@shared/sounds'

import type { JsonFile } from '../storage/json-file'
import { parseSoundPrefs, legacySoundPrefs } from './sound-prefs'

/**
 * Звуки IDE (Settings → Sounds, ADR 0046): владелец настройки - здесь, на диске - свой файл,
 * окну - событием после каждой правки. Решает и то, звать ли поводом вовсе: выключенный не
 * доходит до окна ни звуком, ни светом вкладки.
 */
export class SoundsService {
  /** Записи по очереди: две подряд писали бы один временный файл разом. */
  private writing: Promise<void> = Promise.resolve()

  private constructor(
    private current: SoundPrefs,
    private readonly file: JsonFile<SoundPrefs>,
    private readonly onChange: (prefs: SoundPrefs) => void,
  ) {}

  /**
   * Своя настройка с диска; её ещё нет - перенос из настроек панели Claude Code (там звуки
   * жили раньше) и сразу запись: перенос не повторится, даже если панель их забудет. Запись
   * не удалась (нет места, прав) - запуск идёт дальше с перенесённым в памяти: файл появится
   * с первой правкой, а до неё следующий запуск перенесёт ещё раз.
   */
  static async load(
    file: JsonFile<SoundPrefs>,
    claudeFile: JsonFile<unknown>,
    onChange: (prefs: SoundPrefs) => void,
  ): Promise<SoundsService> {
    const stored = await file.read()

    if (stored !== null) return new SoundsService(parseSoundPrefs(stored), file, onChange)

    const moved = legacySoundPrefs(await claudeFile.read())
    const service = new SoundsService(parseSoundPrefs(moved), file, onChange)

    if (moved) {
      await file
        .write(service.current)
        .catch((error: unknown) => console.warn('[sounds] перенос звуков не записан:', error))
    }

    return service
  }

  get prefs(): SoundPrefs {
    return this.current
  }

  isMuted(event: SoundEvent): boolean {
    return this.current.muted.includes(event)
  }

  /** Настройка из окна целиком; негодное в ней отбрасывается, а не пишется. */
  async set(value: unknown): Promise<SoundPrefs> {
    const next = parseSoundPrefs(value)

    this.current = next
    this.writing = this.writing.catch(() => undefined).then(() => this.file.write(next))
    await this.writing
    this.onChange(next)

    return next
  }
}
