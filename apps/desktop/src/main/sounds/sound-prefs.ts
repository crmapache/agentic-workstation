import type { SoundEvent, SoundPrefs } from '@shared/sounds'
import { SOUND_EVENTS } from '@shared/sounds'

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const isSoundEvent = (value: unknown): value is SoundEvent =>
  SOUND_EVENTS.includes(value as SoundEvent)

const muted = (value: unknown): SoundEvent[] =>
  Array.isArray(value) ? [...new Set(value.filter(isSoundEvent))] : []

const volumes = (value: unknown): SoundPrefs['volumes'] =>
  Object.fromEntries(
    Object.entries(record(value)).flatMap(([event, volume]) =>
      isSoundEvent(event) && typeof volume === 'number' && Number.isFinite(volume)
        ? [[event, Math.min(100, Math.max(0, Math.round(volume)))]]
        : [],
    ),
  )

/**
 * Настройка звуков из файла или из окна: чужие поводы и негодные громкости отбрасываются по
 * одному, а не роняют всю настройку.
 */
export const parseSoundPrefs = (value: unknown): SoundPrefs => {
  const input = record(value)

  return { muted: muted(input['muted']), volumes: volumes(input['volumes']) }
}

/**
 * Звуки из настроек панели Claude Code, где они жили до IDE (claude.json, prefs.mutedSounds
 * и prefs.soundVolumes): перенос один раз, чтобы выставленные громкости не пропали. Нет там
 * ни того ни другого - null, настройка начинается с умолчаний.
 */
export const legacySoundPrefs = (claudeFile: unknown): SoundPrefs | null => {
  const prefs = record(record(claudeFile)['prefs'])

  if (!('mutedSounds' in prefs) && !('soundVolumes' in prefs)) return null

  return { muted: muted(prefs['mutedSounds']), volumes: volumes(prefs['soundVolumes']) }
}
