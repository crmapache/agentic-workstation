import type { LucideIcon } from 'lucide-react'
import { Zap, FilePen, ShieldOff, ShieldCheck, ClipboardList } from 'lucide-react'

import type { ModelInfo, PermissionMode } from '@shared/claude'
import { MAX_CARD_RETRIES, MAX_STAGE_REPEAT } from '@shared/scenarios'

import type { ModeTone } from './EditorModal.types'

/**
 * Режимы, которые сценарий даёт голове и карточкам, как в ACC: спрашивать, принимать правки,
 * план, без вопросов. Чужое значение из файла (auto) меню не теряет - оно встаёт своим пунктом.
 */
export const SCENARIO_MODES: readonly PermissionMode[] = [
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
]

/** Старое имя режима «спрашивать» в файлах сценариев: читается как default. */
export const LEGACY_DEFAULT_MODE = 'manual'

/** Знак режима в меню - тот же, что у режима под полем ввода панели Claude Code. */
export const MODE_ICONS: Record<PermissionMode, LucideIcon> = {
  default: ShieldCheck,
  acceptEdits: FilePen,
  plan: ClipboardList,
  auto: Zap,
  bypassPermissions: ShieldOff,
}

/**
 * Тон слова режима: обычный - тихий, план - мятный (только смотрит), принятие правок - оранжевый
 * (правки идут без вопроса), без вопросов вовсе - красный. Как под полем ввода панели.
 */
export const MODE_TONES: Record<PermissionMode, ModeTone> = {
  default: 'quiet',
  acceptEdits: 'accent',
  plan: 'info',
  auto: 'accent',
  bypassPermissions: 'danger',
}

/** Вариант RUNS «по проходу на пункт списка» - последним, после чисел. */
export const PER_ITEM = 'each'

/** Числа проходов в RUNS: от одного до потолка. */
export const RUN_COUNTS: readonly number[] = Array.from(
  { length: MAX_STAGE_REPEAT },
  (_, index) => index + 1,
)

/** Сколько раз голова может вернуть карточку: от «никогда» до потолка. */
export const RETRY_COUNTS: readonly number[] = Array.from(
  { length: MAX_CARD_RETRIES + 1 },
  (_, index) => index,
)

/** Как пишется имя в промпте - в подсказках, а не в словаре: это синтаксис, его не переводят. */
export const NAME_SAMPLE = 'name'

/**
 * Хвост подложки промпта: перевод строки в конце блока своей строки не даёт, и подложка
 * отставала бы от поля на строку, стоит промпту кончиться переводом строки.
 */
export const BACKDROP_TAIL = '\n'

/** Глиф находки в оглавлении - мельче обычного: строка находки набрана кеглем xs. */
export const PROBLEM_ICON_SIZE = 12

/** Толщина линий глифов редактора - как у селекторов под полем ввода. */
export const ICON_STROKE_WIDTH = 1.75

/** «По умолчанию» в каталоге CLI - в меню это отдельный пункт «как новый чат». */
export const DEFAULT_MODEL_VALUE = 'default'

/** Сколько моделей каталога показывать сразу; остальные (старые версии) - в свёрнутой группе. */
export const MAIN_MODELS = 4

/** Пока CLI не прислал каталог - семьи, которые он знает всегда. */
export const FALLBACK_MODELS: readonly ModelInfo[] = [
  { value: 'opus', displayName: 'Opus', description: '' },
  { value: 'sonnet', displayName: 'Sonnet', description: '' },
  { value: 'haiku', displayName: 'Haiku', description: '' },
]

/** Где редактор открывается: имя и полка - первое, что проверяют у нового. */
export const FIRST_PLACE = { part: 'name' } as const
