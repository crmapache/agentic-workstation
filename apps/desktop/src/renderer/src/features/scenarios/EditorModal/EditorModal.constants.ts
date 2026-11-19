import type { PermissionMode } from '@shared/conversation'
import { PERMISSION_MODES } from '@shared/conversation'
import { MAX_CARD_RETRIES, MAX_STAGE_REPEAT } from '@shared/scenarios'

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

/** Режимы всех провайдеров: `readOnly` есть у Codex и открытых моделей, у Claude его нет. */
export const ALL_MODES: readonly PermissionMode[] = [...PERMISSION_MODES, 'readOnly']

/** Старое имя режима «спрашивать» в файлах сценариев: читается как default. */
export const LEGACY_DEFAULT_MODE = 'manual'

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

/** Где редактор открывается: имя и полка - первое, что проверяют у нового. */
export const FIRST_PLACE = { part: 'name' } as const
