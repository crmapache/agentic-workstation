import type { VoiceView, VoiceSettings, VoiceCapability } from '@shared/voice'
import { parseVoiceSettings } from '@shared/voice'

import type { JsonFile } from '../storage/json-file'
import type { Vault } from '../storage/vault'

/** Ключ Deepgram в Vault голоса. */
const KEY_ENTRY = 'deepgram'
/** Сколько последних знаков ключа видно в настройках. */
const HINT_CHARS = 4

/**
 * Настройки голосового режима (`voice.json`) и ключ Deepgram (`voice.vault`, ADR 0104). Ключ
 * не уходит ни окну, ни телефону: окну - только есть ли он и последние четыре знака.
 */
export class VoiceStore {
  private writing: Promise<void> = Promise.resolve()

  private constructor(
    private current: VoiceSettings,
    private readonly file: JsonFile<VoiceSettings>,
    private readonly vault: Vault,
  ) {}

  static async load(file: JsonFile<VoiceSettings>, vault: Vault): Promise<VoiceStore> {
    return new VoiceStore(parseVoiceSettings(await file.read()), file, vault)
  }

  get settings(): VoiceSettings {
    return this.current
  }

  /** Ключ для соединений с Deepgram; null - не задан. */
  get key(): string | null {
    return this.vault.get(KEY_ENTRY)
  }

  /** Можно ли звонить: режим включён и ключ есть (spec, «Настройки IDE»). */
  get capability(): VoiceCapability {
    if (!this.current.enabled) return { available: false, reason: 'off' }
    if (!this.key) return { available: false, reason: 'noKey' }

    return { available: true }
  }

  view(call: VoiceView['call']): VoiceView {
    const key = this.key

    return {
      settings: this.current,
      key: { saved: key !== null, hint: key ? key.slice(-HINT_CHARS) : null },
      capability: this.capability,
      call,
    }
  }

  /** Настройки из окна целиком; негодное отбрасывается. В работу - только записанное. */
  async set(value: unknown): Promise<VoiceSettings> {
    const next = parseVoiceSettings(value)

    this.writing = this.writing.catch(() => undefined).then(() => this.file.write(next))
    await this.writing
    this.current = next

    return next
  }

  /** Новый ключ или null - забыть. Пробелы по краям (вставка из письма) срезаются. */
  async setKey(key: string | null): Promise<void> {
    const trimmed = key?.trim() || null

    await this.vault.set(KEY_ENTRY, trimmed)
  }
}
