import type { ColorGroup } from './FoundationsView.types'

// Роли, а не палитра: компоненты берут именно их (packages/ui/README.md).
export const COLOR_GROUPS: readonly ColorGroup[] = [
  {
    titleKey: 'groups.surfaces',
    tokens: [
      '--color-bg-app',
      '--color-surface-chrome',
      '--color-surface-panel',
      '--color-surface-editor',
      '--color-surface-overlay',
      '--color-surface-raised',
      '--color-surface-raised-hover',
      '--color-surface-sunken',
      '--color-backdrop',
    ],
  },
  {
    titleKey: 'groups.text',
    tokens: [
      '--color-fg-strong',
      '--color-fg',
      '--color-fg-muted',
      '--color-fg-subtle',
      '--color-fg-disabled',
      '--color-fg-accent',
    ],
  },
  {
    titleKey: 'groups.accent',
    tokens: [
      '--color-accent',
      '--color-accent-strong',
      '--color-accent-soft',
      '--color-accent-soft-hover',
      '--color-accent-border',
    ],
  },
  {
    titleKey: 'groups.states',
    tokens: [
      '--color-success',
      '--color-warning',
      '--color-danger',
      '--color-danger-strong',
      '--color-danger-soft',
      '--color-info',
    ],
  },
  {
    titleKey: 'groups.gauges',
    tokens: [
      '--color-gauge-1',
      '--color-gauge-2',
      '--color-gauge-3',
      '--color-gauge-4',
      '--color-gauge-calm',
    ],
  },
  {
    titleKey: 'groups.charts',
    tokens: [
      '--color-chart-1',
      '--color-chart-2',
      '--color-chart-3',
      '--color-chart-4',
      '--color-chart-other',
    ],
  },
  {
    titleKey: 'groups.interaction',
    tokens: [
      '--color-bg-hover',
      '--color-bg-active',
      '--color-bg-selected',
      '--color-tab-selected',
      '--color-chrome-hover',
      '--color-chrome-active',
      '--color-chrome-selected',
      '--color-selection',
    ],
  },
  {
    titleKey: 'groups.avatars',
    tokens: [
      '--color-avatar-0',
      '--color-avatar-1',
      '--color-avatar-2',
      '--color-avatar-3',
      '--color-avatar-4',
      '--color-avatar-5',
    ],
  },
  {
    titleKey: 'groups.lines',
    tokens: [
      '--color-border',
      '--color-border-strong',
      '--color-focus',
      '--color-scrollbar',
      '--color-scrollbar-hover',
    ],
  },
  {
    titleKey: 'groups.syntax',
    tokens: [
      '--color-syntax-fg',
      '--color-syntax-keyword',
      '--color-syntax-string',
      '--color-syntax-string-expression',
      '--color-syntax-function',
      '--color-syntax-constant',
      '--color-syntax-parameter',
      '--color-syntax-punctuation',
      '--color-syntax-comment',
      '--color-syntax-link',
    ],
  },
  {
    titleKey: 'groups.fileIcons',
    tokens: [
      '--color-file-icon-neutral',
      '--color-file-icon-muted',
      '--color-file-icon-blue',
      '--color-file-icon-cyan',
      '--color-file-icon-teal',
      '--color-file-icon-green',
      '--color-file-icon-yellow',
      '--color-file-icon-orange',
      '--color-file-icon-red',
      '--color-file-icon-violet',
      '--color-file-icon-pink',
    ],
  },
  {
    titleKey: 'groups.ansi',
    tokens: [
      '--color-ansi-black',
      '--color-ansi-red',
      '--color-ansi-green',
      '--color-ansi-yellow',
      '--color-ansi-blue',
      '--color-ansi-magenta',
      '--color-ansi-cyan',
      '--color-ansi-white',
      '--color-ansi-bright-black',
      '--color-ansi-bright-red',
      '--color-ansi-bright-green',
      '--color-ansi-bright-yellow',
      '--color-ansi-bright-blue',
      '--color-ansi-bright-magenta',
      '--color-ansi-bright-cyan',
      '--color-ansi-bright-white',
    ],
  },
  {
    titleKey: 'groups.vcs',
    tokens: [
      '--color-vcs-modified',
      '--color-vcs-added',
      '--color-vcs-untracked',
      '--color-vcs-ignored',
      '--color-vcs-conflict',
      '--color-vcs-deleted',
    ],
  },
]

export const FONT_SIZES = [
  '--font-size-3xl',
  '--font-size-2xl',
  '--font-size-xl',
  '--font-size-lg',
  '--font-size-md',
  '--font-size-sm',
  '--font-size-xs',
  '--font-size-2xs',
] as const

export const FONT_WEIGHTS = [
  '--font-weight-regular',
  '--font-weight-medium',
  '--font-weight-semibold',
] as const

export const SPACES = [
  '--space-0-5',
  '--space-1',
  '--space-1-5',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--space-8',
  '--space-10',
] as const

export const RADII = [
  '--radius-xs',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--radius-xl',
  '--radius-full',
] as const

export const SHADOWS = ['--shadow-overlay', '--shadow-focus', '--shadow-danger'] as const

/** Все токены, значения которых витрина показывает рядом с именем. */
export const VALUE_TOKENS: readonly string[] = [
  ...COLOR_GROUPS.flatMap((group) => group.tokens),
  ...FONT_SIZES,
  ...FONT_WEIGHTS,
  ...SPACES,
  ...RADII,
]
