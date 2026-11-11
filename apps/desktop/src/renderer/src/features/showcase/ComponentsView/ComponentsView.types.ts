import type { ParseKeys } from 'i18next'

import type { AvatarTone } from '@agentic-workstation/ui/Avatar.types'
import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'
import type { FileIconKind } from '@agentic-workstation/ui/FileIcon.types'
import type { ProgressBarTone } from '@agentic-workstation/ui/ProgressBar.types'
import type { RingMeterTone } from '@agentic-workstation/ui/RingMeter.types'

export type SampleTabId = 'overview' | 'changes' | 'history'

export type AvatarSample = { tone: AvatarTone; initials: string }

export type BadgeSample = { tone: BadgeTone; labelKey: ParseKeys<'showcase'> }

export type FileSample = { name: string; folder: string }

export type FileIconSample = { path: string; kind: FileIconKind; expanded?: boolean }

export type ProgressSample = { value: number; tone: ProgressBarTone }

export type RingSample = {
  key: string
  value: number
  pace: number | null
  tone: RingMeterTone
  burning: boolean
}

/** Проект в образце плашек-переключателей: имя - данные, как у настоящего проекта. */
export type ChipSample = AvatarSample & { name: string }
