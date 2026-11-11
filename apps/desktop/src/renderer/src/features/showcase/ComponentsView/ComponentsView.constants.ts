import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'
import type { BarChartPoint } from '@agentic-workstation/ui/BarChart.types'
import type { CalendarHeatmapDay } from '@agentic-workstation/ui/CalendarHeatmap.types'
import type { MarkSteps } from '@agentic-workstation/ui/ChartTip.types'

import type {
  ChipSample,
  FileSample,
  RingSample,
  BadgeSample,
  AvatarSample,
  FileIconSample,
  ProgressSample,
} from './ComponentsView.types'
import { calendarSample } from './ComponentsView.utils'

// Инициалы - данные, как у настоящих проектов (projectInitials), а не текст интерфейса.
export const AVATAR_SAMPLES: readonly AvatarSample[] = [
  { tone: 0, initials: 'AW' },
  { tone: 1, initials: 'RR' },
  { tone: 2, initials: 'SM' },
  { tone: 3, initials: 'CC' },
  { tone: 4, initials: 'LG' },
  { tone: 5, initials: 'NS' },
]

// Имена файлов и папок - данные, а не текст интерфейса. Подобраны так, чтобы были видны
// все пути выбора иконки: точное имя, длинное расширение, папка над файлом, общая иконка.
export const FILE_ICON_SAMPLES: readonly FileIconSample[] = [
  { path: 'src', kind: 'folder' },
  { path: 'src', kind: 'folder', expanded: true },
  { path: '.github', kind: 'folder' },
  { path: 'node_modules', kind: 'folder' },
  { path: 'misc', kind: 'folder' },
  { path: 'misc', kind: 'folder', expanded: true },
  { path: 'App.tsx', kind: 'file' },
  { path: 'index.ts', kind: 'file' },
  { path: 'index.test.ts', kind: 'file' },
  { path: 'main.mjs', kind: 'file' },
  { path: 'package.json', kind: 'file' },
  { path: 'tsconfig.json', kind: 'file' },
  { path: 'styles.module.scss', kind: 'file' },
  { path: 'README.md', kind: 'file' },
  { path: 'notes.md', kind: 'file' },
  { path: '.github/workflows/ci.yml', kind: 'file' },
  { path: 'pnpm-lock.yaml', kind: 'file' },
  { path: '.gitignore', kind: 'file' },
  { path: 'Dockerfile', kind: 'file' },
  { path: 'main.go', kind: 'file' },
  { path: 'app.py', kind: 'file' },
  { path: 'logo.svg', kind: 'file' },
  { path: 'signing.p12', kind: 'file' },
  { path: 'notes.zzz', kind: 'file' },
]

// Мелкие - как в чипах и строках текста ленты Claude Code.
export const FILE_ICON_SMALL_SAMPLES: readonly string[] = [
  'src/App.tsx',
  'package.json',
  'README.md',
  'styles.module.scss',
  'Dockerfile',
]

export const BADGE_SAMPLES: readonly BadgeSample[] = [
  { tone: 'success', labelKey: 'samples.active' },
  { tone: 'warning', labelKey: 'samples.warning' },
  { tone: 'danger', labelKey: 'samples.failed' },
  { tone: 'info', labelKey: 'samples.indexing' },
  { tone: 'accent', labelKey: 'samples.ahead' },
  { tone: 'neutral', labelKey: 'samples.idle' },
]

// Обозначения клавиш - символы, а не слова: не переводятся.
export const KBD_SAMPLES: readonly (readonly string[])[] = [
  ['⌘', 'K'],
  ['⌘', '⇧', 'P'],
  ['⌥', '↵'],
  ['G', 'G'],
]

export const PROGRESS_SAMPLES: readonly ProgressSample[] = [
  { value: 0.32, tone: 'success' },
  { value: 0.18, tone: 'accent' },
  { value: 0.58, tone: 'warning' },
  { value: 0.78, tone: 'high' },
  { value: 0.93, tone: 'danger' },
]

// Иконка рядом с подписью в переключателе ветки - как в шапке окна.
export const SAMPLE_ICON_SIZE = 14

export const SAMPLE_ICON_STROKE_WIDTH = 1.75

// Файлы для образца списка поиска - данные, как у настоящего проекта, не переводятся.
export const FILE_SAMPLES: readonly FileSample[] = [
  { name: 'FileTreeView.tsx', folder: 'features/file-tree/FileTreeView' },
  { name: 'file-tree.store.ts', folder: 'features/file-tree' },
  { name: 'ProjectTabs.tsx', folder: 'features/projects/ProjectTabs' },
  { name: 'tokens.css', folder: 'packages/ui/src/styles' },
]

/** Кольца лимитов: в запасе, быстрее нормы с темпом недели, почти кончилось, доплата. */
export const RING_SAMPLES: readonly RingSample[] = [
  { key: 'calm', value: 22, pace: null, tone: 'success', burning: false },
  { key: 'pace', value: 57, pace: 41, tone: 'warning', burning: false },
  { key: 'high', value: 78, pace: 52, tone: 'high', burning: false },
  { key: 'danger', value: 91, pace: null, tone: 'danger', burning: false },
  { key: 'burning', value: 100, pace: null, tone: 'accent', burning: true },
]

/** Тоны плашки иконки по порядку: те же, что у метки. */
export const PLAQUE_TONES: readonly BadgeTone[] = [
  'neutral',
  'accent',
  'success',
  'warning',
  'danger',
  'info',
]

// Имена проектов - данные, а не текст интерфейса.
export const CHIP_SAMPLES: readonly ChipSample[] = [
  { name: 'agentic-workstation', initials: 'AW', tone: 0 },
  { name: 'roas-radar', initials: 'RR', tone: 1 },
  { name: 'web-tanks', initials: 'WT', tone: 3 },
]

/** Числа образцов графиков - коротко, как на настоящей оси: «312K», «1.2K». */
export const SAMPLE_NUMBERS = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Токены по часам дня - образец одного ряда: тихая ночь, утро, пик после обеда. */
const HOUR_TOKENS: readonly number[] = [
  0, 0, 0, 0, 0, 0, 0, 12_400, 48_000, 132_000, 210_000, 186_000, 64_000, 98_000, 254_000, 312_000,
  280_000, 140_000, 36_000, 0, 22_000, 61_000, 18_000, 0,
]

// Часы и даты образцов - данные, как подписи шагов настоящего графика, а не текст интерфейса.
export const BAR_HOUR_SAMPLES: readonly BarChartPoint[] = HOUR_TOKENS.map((tokens, hour) => {
  const clock = `${String(hour).padStart(2, '0')}:00`

  return { key: clock, label: clock, axisLabel: hour % 4 === 0 ? clock : '', values: [tokens] }
})

/** Неделя строк руками и агентами: человек пишет мало, агенты - много, в выходные тише. */
export const BAR_DAY_SAMPLES: readonly BarChartPoint[] = [
  { key: 'mon', label: 'Mon, Nov 4', axisLabel: 'Nov 4', values: [42, 1240] },
  { key: 'tue', label: 'Tue, Nov 5', axisLabel: '', values: [118, 860] },
  { key: 'wed', label: 'Wed, Nov 6', axisLabel: 'Nov 6', values: [64, 2110] },
  { key: 'thu', label: 'Thu, Nov 7', axisLabel: '', values: [205, 1730] },
  { key: 'fri', label: 'Fri, Nov 8', axisLabel: 'Nov 8', values: [12, 940] },
  { key: 'sat', label: 'Sat, Nov 9', axisLabel: '', values: [0, 310] },
  { key: 'sun', label: 'Sun, Nov 10', axisLabel: 'Nov 10', values: [8, 0] },
]

/** Пустой период: все шаги на месте, чисел нет. */
export const BAR_EMPTY_SAMPLES: readonly BarChartPoint[] = BAR_DAY_SAMPLES.map((point) => ({
  ...point,
  values: [0, 0],
}))

/** Подписи строк календаря: через одну, как у GitHub. */
export const CALENDAR_WEEKDAYS: readonly string[] = ['Mon', '', 'Wed', '', 'Fri', '', '']

/** Год работы: будни плотнее выходных, узор без случайности - образец один и тот же. */
export const CALENDAR_SAMPLE_DAYS: readonly CalendarHeatmapDay[] = calendarSample((index) =>
  index % 7 >= 5 ? (index % 3) * 20 : ((index * 37) % 11) * 30,
)

/** Редкие дни: тот же год, активен каждый семнадцатый. */
export const CALENDAR_SPARSE_DAYS: readonly CalendarHeatmapDay[] = calendarSample((index) =>
  index % 17 === 0 ? (index % 5) * 60 + 30 : 0,
)

/** Образец подсказки графика стоит на одной метке: стрелкам ходить некуда. */
export const CHART_TIP_STEPS: MarkSteps = { across: 1, down: null }
