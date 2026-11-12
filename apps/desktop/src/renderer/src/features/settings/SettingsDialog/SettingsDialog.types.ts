import type { ReactNode } from 'react'

import type { SoundEvent } from '@shared/sounds'

export type SettingRowProps = {
  label: string
  /** Строка под подписью: что настройка делает, коротко. */
  description?: string | undefined
  /** Настройка выключена: подпись приглушена, управление остаётся живым (оно и включает). */
  dimmed?: boolean | undefined
  /** Управление справа: ползунок, проба, переключатель. */
  children: ReactNode
}

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
