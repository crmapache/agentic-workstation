import type { ProviderId } from './providers'
import type { RunState } from './scenario-runs'

/**
 * Статистика IDE (docs/workplan/20-statistics.md): что делали агенты и человек за период.
 * Агентская часть - по всей машине (транскрипты CLI), с разбивкой «в IDE / вне IDE»;
 * человеческая (присутствие, код руками) - только из окна IDE, с момента выпуска.
 * Время - эпоха в мс; дни и часы - по местному поясу машины.
 */

/** Чьи агенты: все, только сессии, которые запускала IDE, или только остальные. */
export type StatsSource = 'all' | 'ide' | 'outside'

/**
 * Фильтр выборки. project - путь проекта (как его знает IDE); null - все проекты.
 * Источник действует на агентские числа; присутствие и код руками - про человека, их
 * источник не делит.
 */
export type StatsFilter = { source: StatsSource; project: string | null }

/** Период [from, to) в мс. Границы дней по местному времени считает окно. */
export type StatsPeriod = { from: number; to: number }

/** Токены одной группы: вход, выход, чтение и запись кеша. */
export type StatsTokens = { input: number; output: number; cacheRead: number; cacheWrite: number }

/** Вопросы разрешений: спрошено человека, разрешено, отказано. */
export type StatsPermissions = { asked: number; allowed: number; denied: number }

/** Сводка периода. Стоимость - «на ценах API», в долларах, а не счёт подписки. */
export type StatsTotals = {
  tokens: StatsTokens
  cost: number
  /** Доля чтения кеша во всём входе модели (0..1); 0 - входа не было. */
  cacheShare: number
  /** Ответов модели (без дублей строк транскрипта). */
  answers: number
  agentLinesAdded: number
  agentLinesRemoved: number
  /** Сколько разных файлов агенты успешно правили. */
  agentFiles: number
  /** Сумма времени ходов: параллельные агенты складываются. */
  agentWorkMs: number
  /** Из agentWorkMs - оценка по транскриптам, а не живые часы IDE (помечается в окне). */
  agentWorkEstimatedMs: number
  /** «Настенное» время: когда работал хотя бы один агент (объединение ходов). */
  agentWallMs: number
  /** Агенты работали, а человека в окне не было (настенное время вне минут присутствия). */
  agentsWithoutYouMs: number
  manualLinesAdded: number
  manualLinesRemoved: number
  /** Набранные знаки и вставленные - отдельно. */
  typed: number
  pasted: number
  presenceMinutes: number
  /** Разговоров с ответами модели в периоде (субагенты - часть своего разговора). */
  sessions: number
  /** Сообщений человека (без служебных, уведомлений и шагов сценариев). */
  prompts: number
  permissions: StatsPermissions
}

/** Шаг графика: час для коротких периодов, день для длинных. */
export type StatsBucketSize = 'hour' | 'day'

/** Точка графика: начало шага (мс, местное время) и числа за шаг. */
export type StatsSeriesPoint = {
  start: number
  tokens: number
  cost: number
  agentLinesAdded: number
  agentLinesRemoved: number
  manualLinesAdded: number
  manualLinesRemoved: number
  /** Настенные минуты агентов в шаге (дробные). */
  agentMinutes: number
  presenceMinutes: number
}

export type StatsSeries = { bucket: StatsBucketSize; points: StatsSeriesPoint[] }

/** Семейство модели для подписи и цены. */
export type StatsModelFamily = 'opus' | 'sonnet' | 'haiku' | 'fable' | 'mythos' | 'other'

export type StatsModelRow = {
  model: string
  family: StatsModelFamily
  tokens: StatsTokens
  cost: number
  answers: number
}

/** Строка по проекту; project null - папка, которую ни с каким проектом не связать. */
export type StatsProjectRow = {
  project: string | null
  tokens: number
  cost: number
  agentLinesAdded: number
  agentLinesRemoved: number
  agentWorkMs: number
}

/** Инструмент по имени; инструменты MCP сюда не входят - они в servers по серверу. */
export type StatsToolRow = { tool: string; calls: number }

/** Сервер MCP (коннектор) и сколько раз звали его инструменты. */
export type StatsServerRow = { server: string; calls: number }

/** Язык по расширению файла ('' - без расширения): строки агентов и руками. */
export type StatsLanguageRow = {
  ext: string
  agentAdded: number
  agentRemoved: number
  manualAdded: number
  manualRemoved: number
}

/** День календаря активности (последние 53 недели, по местному времени). */
export type StatsCalendarDay = {
  /** ГГГГ-ММ-ДД местной даты. */
  day: string
  /** Местная полночь дня, мс. */
  start: number
  presenceMinutes: number
  tokens: number
  prompts: number
}

/**
 * Серии дней: день активен, если в нём есть минуты присутствия или сообщения человека.
 * Текущая не рвётся, пока не кончился сегодняшний день: считается до вчера, если сегодня
 * ещё ничего не было.
 */
export type StatsStreaks = { current: number; best: number; activeToday: boolean }

/** Отрезок по кругу: from включительно, to - исключительно (to может быть меньше from). */
export type StatsRange = { from: number; to: number }

/**
 * Пик за период: три подряд дня недели (0 - понедельник) и три подряд часа с наибольшей
 * активностью. По присутствию, если оно есть в периоде, иначе по токенам.
 */
export type StatsPeak = {
  basis: 'presence' | 'tokens'
  weekdays: StatsRange | null
  hours: StatsRange | null
}

/** Рабочие сессии: куски присутствия, разделённые паузой больше 30 минут. */
export type StatsWorkSessions = { count: number; longestMinutes: number; averageMinutes: number }

export type StatsScenarioRow = { scenario: string; runs: number }

/** Прогоны сценариев, начатые в периоде. */
export type StatsScenarios = {
  runs: number
  /** Доля прогонов, кончившихся успехом, среди законченных (0..1). */
  doneShare: number
  averageActiveMs: number
  averageCost: number
  top: StatsScenarioRow[]
}

/** Чтение транскриптов: идёт ли, сколько сделано - окно показывает «считаю». */
export type StatsScanProgress = {
  running: boolean
  /** Первый полный проход по транскриптам уже был: числа истории полные. */
  firstPassDone: boolean
  filesDone: number
  filesTotal: number
  bytesDone: number
  bytesTotal: number
  /** Когда кончился последний проход, мс; null - ещё не кончался. */
  lastScanAt: number | null
}

/** Всё окно статистики за один запрос. */
export type StatsReport = {
  period: StatsPeriod
  filter: StatsFilter
  /** Самое раннее событие в базе, мс; null - база пуста. */
  dataStart: number | null
  /**
   * Начало данных о человеке (присутствие, код руками), мс; null - их ещё нет. Они копятся с
   * выпуска статистики, позже агентских: сравнение этих чисел с прошлым периодом честно, только
   * если тот начинается не раньше.
   */
  humanDataStart: number | null
  totals: StatsTotals
  /** Прошлый такой же период; null - он начинается раньше данных и сравнение нечестно. */
  previous: StatsTotals | null
  series: StatsSeries
  models: StatsModelRow[]
  projects: StatsProjectRow[]
  tools: StatsToolRow[]
  servers: StatsServerRow[]
  languages: StatsLanguageRow[]
  calendar: StatsCalendarDay[]
  streaks: StatsStreaks
  peak: StatsPeak
  workSessions: StatsWorkSessions
  scenarios: StatsScenarios
  scan: StatsScanProgress
}

/** Ход агента, отмеренный живыми часами IDE (без ожидания ответа человека). */
export type StatsTurnNote = {
  provider: ProviderId
  session: string
  project: string
  startedAt: number
  endedAt: number
  workMs: number
}

/** Ответ человека на вопрос разрешения. toolUseId сводит его с той же записью транскрипта. */
export type StatsPermissionNote = {
  provider: ProviderId
  session: string
  project: string
  at: number
  decision: 'allow' | 'deny'
  toolUseId?: string
}

/** Минута присутствия: эпоха в минутах (мс / 60000) и проект окна. */
export type StatsPresenceNote = { minute: number; project: string }

/** Правки руками за минуту в одном проекте и одном расширении (без точки, '' - без него). */
export type StatsManualNote = {
  minute: number
  project: string
  ext: string
  typed: number
  pasted: number
  added: number
  removed: number
}

/** Итог прогона сценария - пишется по его концу. */
export type StatsScenarioRunNote = {
  runId: string
  provider: ProviderId
  project: string
  scenario: string
  startedAt: number
  endedAt: number
  state: RunState
  cost: number
  tokens: number
  activeMs: number
}

/** Сессия, которую запустила IDE: разговор панели или сессия сценария. */
export type StatsIdeSessionKind = 'panel' | 'scenario'
