import type { LucideIcon } from 'lucide-react'
import {
  Link,
  Trash2,
  FilePlus,
  FileClock,
  RotateCcw,
  SquarePen,
  FolderInput,
  ExternalLink,
  TextCursorInput,
} from 'lucide-react'

import type { HistoryContent } from '@shared/local-history'

import { AI_ICON } from '../../../lib/ai-icon.constants'
import type { CauseName } from './LocalHistoryView.utils'

/** Знак события в списке: правка, извне, агент (знак ИИ), перенос, удаление... */
export const CAUSE_ICONS: Record<CauseName, LucideIcon> = {
  edit: SquarePen,
  outside: ExternalLink,
  agent: AI_ICON,
  agentCreated: AI_ICON,
  refactor: Link,
  created: FilePlus,
  deleted: Trash2,
  moved: FolderInput,
  renamed: TextCursorInput,
  restored: RotateCcw,
  earliest: FileClock,
}

/** Пустая сторона разницы: файла до события не было или после него нет. */
export const NO_CONTENT: HistoryContent = { kind: 'text', text: '' }
