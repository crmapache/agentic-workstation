import type { SoundEvent } from '@shared/sounds'

export type SoundRowProps = {
  event: SoundEvent
  isOn: boolean
  /** Проценты; у выключенного - запомненная громкость, ползунок живой и включает. */
  volume: number
  onToggle: (event: SoundEvent) => void
  onVolume: (event: SoundEvent, volume: number) => void
  /** Сыграть повод сейчас - по одному имени не понять, что услышишь. */
  onPreview: (event: SoundEvent) => void
}
