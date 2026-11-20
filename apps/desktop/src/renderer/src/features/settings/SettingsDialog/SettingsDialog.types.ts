import type { ReactNode } from 'react'

import type { AiChoice } from '@shared/ide-prefs'
import type { ProviderInfo } from '@shared/providers'
import type { SoundEvent } from '@shared/sounds'

import type { ChoiceOption } from '@agentic-workstation/ui/ChoiceField.types'

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

export type PickRowProps = {
  label: string
  description: string
  value: string
  options: readonly ChoiceOption[]
  onPick: (value: string) => void
}

export type PickButtonProps = {
  /** Что выбирают: имя меню для скринридера. */
  label: string
  value: string
  options: readonly ChoiceOption[]
  onPick: (value: string) => void
}

export type AiChoiceRowProps = {
  /** Место в цепочке: 0 - основной, дальше - запасные. */
  index: number
  choice: AiChoice
  providers: readonly ProviderInfo[]
  onChange: (choice: AiChoice) => void
  /** Убрать из цепочки; у основного нет - кому-то писать сообщение надо. */
  onRemove?: (() => void) | undefined
}
