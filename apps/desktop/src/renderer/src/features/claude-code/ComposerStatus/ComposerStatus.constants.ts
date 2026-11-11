import type { ParseKeys } from 'i18next'
import type { LucideIcon } from 'lucide-react'
import {
  Cpu,
  Gem,
  Zap,
  Leaf,
  Brain,
  Flame,
  Scale,
  Rabbit,
  Feather,
  FilePen,
  BookOpen,
  Settings,
  ShieldOff,
  ShieldCheck,
  BrainCircuit,
  ClipboardList,
} from 'lucide-react'

import { EFFORT_LEVELS } from '@shared/claude'
import type { ModelInfo, EffortLevel, PermissionMode } from '@shared/claude'
import type { PanelModelFamily } from '@shared/claude-models'
import { MINUTE_MS } from '@shared/time-units'

import type { ModeTone, SetupSection } from './ComposerStatus.types'

/** Иконка режима разрешений в кнопке и в меню. */
export const MODE_ICONS: Record<PermissionMode, LucideIcon> = {
  default: ShieldCheck,
  acceptEdits: FilePen,
  plan: ClipboardList,
  auto: Zap,
  bypassPermissions: ShieldOff,
}

/**
 * Тон слова режима в индикаторе: обычный - тихий, план - мятный (только смотрит), принятие правок -
 * оранжевый (внимание: правки идут без вопроса), без вопросов вовсе - красный.
 */
export const MODE_TONES: Record<PermissionMode, ModeTone> = {
  default: 'quiet',
  acceptEdits: 'accent',
  plan: 'info',
  auto: 'accent',
  bypassPermissions: 'danger',
}

/**
 * Иконка пункта «по умолчанию» в разделах Model и Effort: значение берётся из настроек
 * Claude Code, а не выбрано здесь.
 */
export const DEFAULT_CHOICE_ICON: LucideIcon = Settings

/**
 * Иконка уровня усилия - по смыслу подсказки, как у режимов: быстро, баланс, думает,
 * думает глубоко, всё, что есть. Полоски сигнала в 16 пикселях у нижних уровней
 * пропадали до пары точек.
 */
export const EFFORT_ICONS: Record<EffortLevel, LucideIcon> = {
  low: Rabbit,
  medium: Scale,
  high: Brain,
  xhigh: BrainCircuit,
  max: Flame,
}

/**
 * Уровни в разделе Effort - сильнейший сверху, как модели в разделе Model. `EFFORT_LEVELS`
 * идёт от слабого, как у CLI, поэтому меню переворачивает его, а не правит общий список.
 */
export const EFFORT_MENU_ORDER: readonly EffortLevel[] = EFFORT_LEVELS.toReversed()

/**
 * Иконка модели по семье: fable - самоцвет (самая сильная), opus - книга (большой труд),
 * sonnet - перо, haiku - лист, opusplan - план. Дальше в меню старые версии той же семьи -
 * с той же иконкой.
 */
export const MODEL_ICONS: Record<PanelModelFamily, LucideIcon> = {
  fable: Gem,
  opus: BookOpen,
  opusplan: ClipboardList,
  sonnet: Feather,
  haiku: Leaf,
}

/** Модель без семьи Claude: своя через прокси или шлюз, чужого провайдера. */
export const OTHER_MODEL_ICON: LucideIcon = Cpu

/** Части значения индикатора: «Opus 5.5 · High effort · Auto». Знак, а не текст: не переводится. */
export const SETUP_SEPARATOR = ' · '

/** Разделы панели индикатора по порядку: стрелки влево и вправо ходят по ним по кругу. */
export const SETUP_SECTIONS: readonly SetupSection[] = ['model', 'effort', 'mode']

/** Подпись раздела на его вкладке и имя меню раздела для скринридера. */
export const SECTION_TEXTS: Record<SetupSection, { tab: ParseKeys; menu: ParseKeys }> = {
  model: { tab: 'claudeCode.status.modelCaption', menu: 'claudeCode.model.menu' },
  effort: { tab: 'claudeCode.status.effortCaption', menu: 'claudeCode.effort.menu' },
  mode: { tab: 'claudeCode.status.modeCaption', menu: 'claudeCode.modes.menu' },
}

/** Клавиши, которыми из списка раздела переходят в соседний. */
export const SECTION_STEPS: Readonly<Record<string, 1 | -1>> = { ArrowLeft: -1, ArrowRight: 1 }

/** Значение каталога CLI «модель по умолчанию» - в панели это «как в настройках». */
export const DEFAULT_MODEL_VALUE = 'default'

/** Сколько моделей каталога показывать сразу; остальные - в свёрнутой группе. */
export const MAIN_MODELS = 5

/**
 * Порядок основных моделей в меню - сильнейшая первой. Каталог CLI ставит Opus раньше
 * Fable, а Fable сильнее («for your toughest challenges»).
 */
export const MODEL_RANK: readonly PanelModelFamily[] = [
  'fable',
  'opus',
  'opusplan',
  'sonnet',
  'haiku',
]

/**
 * Модели, пока CLI не прислал свой каталог (до первого хода в IDE). Имена - данные
 * CLI, а не текст интерфейса: их не переводят.
 */
export const FALLBACK_MODELS: readonly ModelInfo[] = [
  { value: 'opus', displayName: 'Opus', description: '' },
  { value: 'fable', displayName: 'Fable', description: '' },
  { value: 'sonnet', displayName: 'Sonnet', description: '' },
  { value: 'haiku', displayName: 'Haiku', description: '' },
]

/** Как часто освежать токены за день: главный процесс дочитывает только дописанное. */
export const TODAY_TOKENS_REFRESH_MS = MINUTE_MS
