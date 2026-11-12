import type { SoundEvent, SoundPrefs } from '@shared/sounds'
import { DEFAULT_SOUND_VOLUME } from '@shared/sounds'

/** Громкость повода, проценты; не трогали - по умолчанию. */
export const volumeOf = (prefs: SoundPrefs, event: SoundEvent): number =>
  prefs.volumes[event] ?? DEFAULT_SOUND_VOLUME

export const isSoundOn = (prefs: SoundPrefs, event: SoundEvent): boolean =>
  !prefs.muted.includes(event)

const withVolume = (
  volumes: SoundPrefs['volumes'],
  event: SoundEvent,
  volume: number | null,
): SoundPrefs['volumes'] => {
  const { [event]: _previous, ...rest } = volumes

  return volume === null ? rest : { ...rest, [event]: volume }
}

/**
 * Галочка. Выключенный звук помнит громкость: включая обратно, ждут свои прежние
 * проценты. Исключение - звук, выключенный самим ползунком в ноль: вернуть «как было»
 * значило бы вернуть тишину, поэтому он включается на громкости по умолчанию.
 */
export const toggleSound = (prefs: SoundPrefs, event: SoundEvent): SoundPrefs => {
  if (isSoundOn(prefs, event)) return { ...prefs, muted: [...prefs.muted, event] }

  return {
    muted: prefs.muted.filter((item) => item !== event),
    volumes: volumeOf(prefs, event) === 0 ? withVolume(prefs.volumes, event, null) : prefs.volumes,
  }
}

/**
 * Громкость с ползунка - он же галочка: ноль и «выключено» - одно и то же. Утянутый в
 * ноль выключает звук, поднятый обратно - включает. Громкость по умолчанию не
 * хранится: тишина в настройках и значит «как есть».
 */
export const setSoundVolume = (
  prefs: SoundPrefs,
  event: SoundEvent,
  volume: number,
): SoundPrefs => {
  const value = Math.min(100, Math.max(0, Math.round(volume)))
  const others = prefs.muted.filter((item) => item !== event)

  return {
    muted: value === 0 ? [...others, event] : others,
    volumes: withVolume(prefs.volumes, event, value === DEFAULT_SOUND_VOLUME ? null : value),
  }
}
