import type { TFunction } from 'i18next'

import type { RunMove, RunNote, RunStep, RunLimit, ScenarioRun } from '@shared/scenario-runs'

import { formatCost, formatTokens, formatDuration } from './scenarios-format.utils'
import { LIMIT_WINDOW_KEYS } from './scenarios-run.constants'
import type { StageStanding } from './scenarios-timeline.utils'
import { cutCardOf } from './scenarios-timeline.utils'

/**
 * Слова окна прогона (places.ts и moves.ts в ACC): где строка стоит в этапе, сколько этапа,
 * что панель сделала с аккаунтом, чем прогон кончился. Запись прогона несёт имена и цифры, а
 * фраза собирается здесь - в языке того, кто читает.
 */

/** Как этап ходит по кругу - то, что знает о нём строка шага таймлайна. */
export type StepPlace = { passes: number; untilDone: boolean; perItem: boolean }

/** Что знает о размере этапа его заголовок: items - длина списка, null - списка ещё нет. */
export type StageSize = { passes: number; untilDone: boolean; items?: number | null | undefined }

/** Метка на строке шага: проход, пункт списка или ничего у этапа, что идёт один раз. */
export const stepPlaceWords = (
  t: TFunction,
  step: Pick<RunStep, 'pass' | 'item'>,
  place: StepPlace,
): string => {
  if (place.perItem) {
    const item = step.item

    if (!item) return t('scenarios.run.step.listPending')
    if (item.count === 0) return t('scenarios.run.step.listEmpty')
    if (item.again) return t('scenarios.run.step.secondGo')

    return t('scenarios.run.step.itemOf', { index: item.index, count: item.count })
  }

  if (place.passes <= 1) return ''

  const values = { pass: step.pass, passes: place.passes }

  return place.untilDone
    ? t('scenarios.run.step.passOfUpTo', values)
    : t('scenarios.run.step.passOf', values)
}

/** Размер этапа в заголовке: длина списка или сколько раз он идёт по кругу. */
export const stageSizeWords = (t: TFunction, stage: StageSize): string => {
  if (stage.items !== undefined) {
    if (stage.items === null) return t('scenarios.run.stage.listAhead')

    return stage.items === 0
      ? t('scenarios.run.stage.listEmpty')
      : t('scenarios.run.stage.items', { count: stage.items })
  }

  if (stage.passes <= 1) return ''

  return stage.untilDone
    ? t('scenarios.run.stage.roundsUntil', { count: stage.passes })
    : t('scenarios.run.stage.rounds', { count: stage.passes })
}

/**
 * Заголовок этапа несёт свой вердикт: размер и где прогон относительно этапа - «done · 8m»,
 * «here now», «not reached». «Empty list» уже сказал, чем кончилось, и времени не занял.
 */
export const stageVerdictWords = (
  t: TFunction,
  stage: StageSize & { standing: StageStanding; took: number },
): string => {
  const standing =
    stage.items === 0
      ? ''
      : stage.standing === 'done'
        ? t('scenarios.run.stage.done', { took: formatDuration(stage.took) })
        : stage.standing === 'here'
          ? t('scenarios.run.stage.here')
          : t('scenarios.run.stage.notReached')

  return [stageSizeWords(t, stage), standing].filter(Boolean).join(' · ')
}

/** Пункт, ради которого строка, - именем от головы; пусто у строки не по пункту. */
export const itemLabelOf = (step: Pick<RunStep, 'item'>): string =>
  step.item && step.item.count > 0 ? step.item.label : ''

/** Час по часам читающего: с ним сравнивают свой вечер. */
export const clockOf = (at: number): string =>
  new Date(at).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })

/** Аккаунт, как его называет таймлайн: имя от человека или адрес; пусто - вход самого CLI. */
const accountName = (t: TFunction, name: string): string =>
  name || t('scenarios.run.limit.defaultAccount')

/** «The 5-hour limit» по имени окна CLI; незнакомое или пустое окно - «The usage limit». */
export const limitName = (t: TFunction, window: string): string => {
  const key = LIMIT_WINDOW_KEYS[window]

  return key ? t('scenarios.run.limit.named', { window: t(key) }) : t('scenarios.run.limit.plain')
}

/** Фраза заметки панели (who: panel): переехала на другой аккаунт или ждёт лимита. */
export const moveWords = (t: TFunction, move: RunMove): string => {
  const to = accountName(t, move.to)

  if (move.reason === 'choice') return t('scenarios.run.moves.choice', { to })

  const from = accountName(t, move.from)
  const limit = limitName(t, move.window)
  const sentence =
    move.reason === 'unfit'
      ? move.waits
        ? t('scenarios.run.moves.unfitWait', { from })
        : t('scenarios.run.moves.unfitMoved', { from, to })
      : move.waits
        ? t('scenarios.run.moves.limitWait', { limit, from })
        : t('scenarios.run.moves.limitMoved', { limit, from, to })
  // Ожидание говорит, когда прогон пойдёт сам, - если это известно.
  const later =
    move.waits && move.until > 0
      ? t('scenarios.run.moves.goesOnAt', { clock: clockOf(move.until) })
      : ''

  return [sentence, later].filter(Boolean).join(' ')
}

/** Строка LIMIT, пока прогон пережидает лимит: чей, какое окно, когда пойдёт сам. */
export const limitWords = (t: TFunction, limit: RunLimit): string => {
  const account = accountName(t, limit.account)
  const clock = clockOf(limit.until)

  return limit.reason === 'unfit'
    ? t('scenarios.run.limit.unfitResting', { account, clock })
    : t('scenarios.run.limit.resting', { limit: limitName(t, limit.window), account, clock })
}

/** Чем кончился законченный прогон - с карточкой, на которой встал: «stopped» без неё читалось «сломалось». */
export const endWords = (t: TFunction, run: Pick<ScenarioRun, 'state' | 'steps'>): string => {
  if (run.state === 'done') return t('scenarios.run.end.done')

  const card = cutCardOf(run)

  if (run.state === 'stopped') {
    return card ? t('scenarios.run.end.stopped', { card }) : t('scenarios.run.end.stoppedEarly')
  }

  return card ? t('scenarios.run.end.failed', { card }) : t('scenarios.run.end.failedEarly')
}

/**
 * Строки под итогом: поломка своим именем и ошибка движка - если слова поломки её уже не несут.
 * «Cut short by you» не пишется: итог над ней уже сказал, что остановил человек.
 */
export const endDetails = (t: TFunction, run: Pick<ScenarioRun, 'failure' | 'error'>): string[] => {
  const failure =
    run.failure && run.failure !== 'stopped'
      ? t(`scenarios.run.failures.${run.failure}`, { error: run.error })
      : ''
  const error = run.error && !failure.includes(run.error) ? run.error : ''

  return [failure, error].filter(Boolean)
}

/**
 * Показания шага в шапке его лога: время работы, токены, деньги - в порядке, в каком их ищут.
 * worked 0 - шаг ещё идёт: цифре, что бежит, не место в строке, которая стоит.
 */
export const stepFacts = (worked: number, tokens: number, cost: number): string =>
  [
    worked > 0 ? formatDuration(worked) : '',
    tokens > 0 ? formatTokens(tokens) : '',
    cost > 0 ? formatCost(cost) : '',
  ]
    .filter(Boolean)
    .join(' · ')

/**
 * Аргументы вызова, о котором спрашивают разрешения: целый JSON - с отступами, обрезанный
 * движком (уже не JSON) - как пришёл.
 */
export const detailText = (detail: string): string => {
  try {
    return JSON.stringify(JSON.parse(detail), null, 2)
  } catch {
    return detail
  }
}

/** Штамп последних слов человека: под ними встаёт «главный поток пишет ответ». */
export const lastToldAt = (notes: readonly RunNote[]): number =>
  notes.reduce((last, note) => (note.who === 'person' ? Math.max(last, note.at) : last), 0)
