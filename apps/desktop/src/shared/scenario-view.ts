import type { ConversationFeed } from './claude-feed'
import type { ProviderId } from './providers'
import type { RunSummary, ScenarioRun } from './scenario-runs'
import type {
  Scenario,
  ScenarioCode,
  ScenarioScope,
  ScenarioRepeat,
  ScenarioSchedule,
} from './scenarios'

/**
 * Что вид сценариев получает от главного процесса о проекте: полки, прошлые прогоны и
 * расписание. Очереди всех проектов - отдельным снимком (`ScenarioQueuesView`), идущий прогон
 * целиком - только окну, где он открыт.
 */
export type ScenarioShelvesView = {
  /** Обе полки: проектная, потом личная, каждая в своём порядке. */
  scenarios: Scenario[]
  /** Прогоны с диска, свежие первыми. */
  runs: RunSummary[]
  schedules: ScenarioSchedule[]
  /** Файл расписания не прочитался - это не «расписаний нет». */
  schedulesUnread: boolean
  /** Есть ли куда положить проектный сценарий (папка проекта на месте). */
  canShare: boolean
}

/** Полки, прогоны или расписание проекта поменялись. */
export type ScenarioShelvesChanged = { projectPath: string; view: ScenarioShelvesView }

/** Запись прогона целиком - по кругу, один прогон за удар сердца. */
export type ScenarioRunChanged = { projectPath: string; run: ScenarioRun }

export type ScenarioSaveOutcome =
  { ok: true; scenario: Scenario } | { ok: false; code: ScenarioCode }

/** Модель написала сценарий (он не сохранён) или не смогла: текст CLI, короткий. */
export type ScenarioDraftOutcome =
  { ok: true; scenario: Scenario } | { ok: false; error: string; cancelled: boolean }

/** Лог шага - его разговор, прочитанный как обычная лента. found false - записи нет. */
export type StepLogPage = { found: boolean; feed: ConversationFeed | null }

/** Отложенный запуск из формы When; scheduleId пусто - новый. */
export type ScenarioHourRequest = {
  scenarioId: string
  scope: ScenarioScope
  scheduleId: string
  at: number
  repeat: ScenarioRepeat
  weekday: number
  inputs: Record<string, string>
  /** Час поднимет новую очередь - в отдельном worktree или в папке проекта. */
  worktree: boolean
  provider: ProviderId
}

export type ScenarioRunControl = 'pause' | 'resume' | 'stop'
