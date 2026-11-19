import type { LucideIcon } from 'lucide-react'
import { Eye, Zap, FilePen, ShieldOff, ShieldCheck, ClipboardList } from 'lucide-react'

import type { PermissionMode } from '@shared/conversation'

/** Тон слова режима: насколько свободно действует модель. */
export type ModeTone = 'quiet' | 'info' | 'accent' | 'danger'

/**
 * Знак режима разрешений - один на всё окно: кнопка и меню под полем ввода панели провайдера,
 * меню MODE сценария.
 */
export const MODE_ICONS: Record<PermissionMode, LucideIcon> = {
  default: ShieldCheck,
  acceptEdits: FilePen,
  readOnly: Eye,
  plan: ClipboardList,
  auto: Zap,
  bypassPermissions: ShieldOff,
}

/**
 * Тон слова режима: обычный - тихий, план и только чтение - мятный (только смотрит), принятие
 * правок - оранжевый (правки идут без вопроса), без вопросов вовсе - красный.
 */
export const MODE_TONES: Record<PermissionMode, ModeTone> = {
  default: 'quiet',
  acceptEdits: 'accent',
  readOnly: 'info',
  plan: 'info',
  auto: 'accent',
  bypassPermissions: 'danger',
}
