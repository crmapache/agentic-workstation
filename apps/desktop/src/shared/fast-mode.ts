import type { ModelInfo } from './conversation'
import type { FastReport } from './panel-extras'

/**
 * Быстрый режим (/fast): у Claude Opus до 2.5 раза быстрее за счёт usage credits, у Codex -
 * приоритетная очередь. Две половины из двух мест: попросили ли - знает панель, работает ли -
 * говорит CLI в начале и в конце каждого хода. Одна функция читает их вместе, чтобы меню, чип
 * и строка не расходились.
 */

/** Слово CLI «хост ещё не попросил» и «ещё выясняю»: это не отказ. */
const NOT_ASKED = 'sdk_opt_in_required'
const CHECKING = 'pending'

/**
 * Что показать: не просили; просили, а CLI ещё не ответил (ответит в начале следующего
 * хода); работает (fromSettings - панель не просила, режим включён настройками самого CLI,
 * как `service_tier` у Codex); пауза после лимита; недоступен - с причиной словом CLI.
 */
export type FastModeShown =
  | { kind: 'off' }
  | { kind: 'waiting' }
  | { kind: 'on'; fromSettings?: true }
  | { kind: 'cooldown' }
  | { kind: 'unavailable'; reason: string }

/**
 * asked - просьба панели: true - включить, false - выключить, нет - как в настройках CLI.
 * Смена просьбы стирает прошлый ответ (report), так что ответ всегда о текущей просьбе.
 */
export const fastModeShown = (
  asked: boolean | undefined,
  report: FastReport | undefined,
): FastModeShown => {
  if (asked === undefined && report?.state === 'on') return { kind: 'on', fromSettings: true }
  if (!asked) return { kind: 'off' }
  if (!report) return { kind: 'waiting' }
  if (report.state === 'on') return { kind: 'on' }
  if (report.state === 'cooldown') return { kind: 'cooldown' }

  const { reason } = report

  return !reason || reason === NOT_ASKED || reason === CHECKING
    ? { kind: 'waiting' }
    : { kind: 'unavailable', reason }
}

/**
 * Включён ли переключатель «Fast mode»: по показанному, а не по просьбе. Выключить режим из
 * настроек CLI - просьба «выключить» для этого разговора, сам он обратно не включится.
 */
export const isFastModeChecked = (
  asked: boolean | undefined,
  report: FastReport | undefined,
): boolean => fastModeShown(asked, report).kind !== 'off'

/** Модель без метки окна: «claude-opus-5-5[1m]» → «claude-opus-5-5». */
const unmarked = (model: string) => model.replace(/\[[^\]]*\]$/, '')

/** Правило самого CLI по имени, когда каталога нет: Opus 4.8 и семья Opus 5. */
const byName = (model: string) => {
  const name = unmarked(model).toLowerCase()

  return name === 'opus' || name.includes('opus-4-8') || name.includes('opus-5')
}

/**
 * Есть ли у модели быстрый режим по слову каталога CLI (`supportsFastMode`): точное
 * значение отвечает за себя, имя не из меню сверяется с развёрнутыми именами без метки
 * окна. null - каталог не сказал (короткое «opus» - семья, за Opus 4.7 не поручится).
 */
const catalogFastMode = (models: readonly ModelInfo[], model: string): boolean | null => {
  // «По умолчанию» без своей строки в каталоге (у Codex) - модель каталога по умолчанию.
  const exact =
    models.find((option) => option.value === model) ??
    (model === 'default' ? models.find((option) => option.isDefault) : undefined)

  if (exact) return exact.fast ?? null

  const resolved = models.find(
    (option) => option.resolved && unmarked(option.resolved) === unmarked(model),
  )

  return resolved?.fast ?? null
}

/**
 * Предлагать ли быстрый режим для модели (null - «по умолчанию»): по каталогу, а без
 * каталога - по правилу самого CLI.
 */
export const modelHasFastMode = (models: readonly ModelInfo[], model: string | null): boolean => {
  const name = model ?? 'default'

  return catalogFastMode(models, name) ?? (models.length === 0 && byName(name))
}

/**
 * Снимает ли выбор модели быстрый режим: модель без него его выключает, и сам он не
 * вернётся. Каталог не сказал - не трогать: выключить работающий режим хуже.
 */
export const losesFastMode = (models: readonly ModelInfo[], model: string | null): boolean => {
  const name = model ?? 'default'
  const known = catalogFastMode(models, name)

  return known === null ? models.length === 0 && model !== null && !byName(name) : !known
}
