import {
  FONT_STYLE_BOLD,
  FONT_STYLE_ITALIC,
  FONT_STYLE_UNDERLINE,
  FONT_STYLE_STRIKETHROUGH,
} from '../../lib/highlighter.constants'

/** Имя темы Monaco, собранной из токенов дизайн-системы. */
export const EDITOR_THEME = 'agentic-workstation'

/**
 * Роли дизайн-системы, из которых собирается тема редактора (ADR 0005: своих цветов у
 * редактора нет). Monaco понимает только числа, поэтому роли читаются из CSS на старте
 * редактора и переводятся в цвет.
 */
export const THEME_ROLES = {
  syntaxFg: '--color-syntax-fg',
  syntaxKeyword: '--color-syntax-keyword',
  syntaxString: '--color-syntax-string',
  syntaxStringExpression: '--color-syntax-string-expression',
  syntaxFunction: '--color-syntax-function',
  syntaxConstant: '--color-syntax-constant',
  syntaxParameter: '--color-syntax-parameter',
  syntaxPunctuation: '--color-syntax-punctuation',
  syntaxComment: '--color-syntax-comment',
  syntaxLink: '--color-syntax-link',
  app: '--color-bg-app',
  editor: '--color-surface-editor',
  overlay: '--color-surface-overlay',
  sunken: '--color-surface-sunken',
  fgStrong: '--color-fg-strong',
  fg: '--color-fg',
  fgMuted: '--color-fg-muted',
  fgSubtle: '--color-fg-subtle',
  fgDisabled: '--color-fg-disabled',
  fgAccent: '--color-fg-accent',
  border: '--color-border',
  borderStrong: '--color-border-strong',
  hover: '--color-bg-hover',
  active: '--color-bg-active',
  selected: '--color-bg-selected',
  selection: '--color-selection',
  focus: '--color-focus',
  accent: '--color-accent',
  accentSoft: '--color-accent-soft',
  accentSoftHover: '--color-accent-soft-hover',
  accentBorder: '--color-accent-border',
  success: '--color-success',
  warning: '--color-warning',
  danger: '--color-danger',
  info: '--color-info',
  modified: '--color-vcs-modified',
} as const

/**
 * Доли тона из токенов плашек: подложка (--tint-soft) - у строк и слов разницы, как у строк
 * диффа в ленте Claude Code; метка (--tint-border) - у отметок разницы на полосе прокрутки.
 */
export const TINT_ROLES = { soft: '--tint-soft', border: '--tint-border' } as const

/** Шрифт кода и его размеры - тоже токены: редактор пишет тем же шрифтом, что блоки кода. */
export const TYPE_ROLES = {
  family: '--font-code',
  size: '--font-size-md',
  lineHeight: '--line-height-normal',
} as const

/** Начертания TextMate - биты маски: курсив, жирный, подчёркнутый, зачёркнутый. */
export const FONT_STYLE_BITS: readonly (readonly [number, string])[] = [
  [FONT_STYLE_ITALIC, 'italic'],
  [FONT_STYLE_BOLD, 'bold'],
  [FONT_STYLE_UNDERLINE, 'underline'],
  [FONT_STYLE_STRIKETHROUGH, 'strikethrough'],
]

/** Все сочетания начертаний: правило темы заводится на каждое. */
export const FONT_STYLE_COMBINATIONS = 16

/** Ничего: фон редактора, тени и рамки, которых в плоском стекле нет (ADR 0006). */
export const TRANSPARENT = '#00000000'

/**
 * Начертание, которое роль несёт всегда, поверх того, что дала грамматика: комментарий -
 * курсивом (README дизайн-системы), как в блоках кода ленты.
 */
export const ROLE_FONT_STYLE: Readonly<Record<string, number>> = {
  'token-comment': FONT_STYLE_ITALIC,
}
