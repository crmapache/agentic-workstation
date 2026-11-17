import { createHash } from 'node:crypto'

import type { GoalWatch, GoalEventKind } from '@shared/goals'

import { checkGap, failureGap, WATCH_FAILURES_WAKE } from './goal-clock'
import { SEEN_MAX } from './goal-parse'

/** Ответ инструмента коннектора на чтение: текст или почему не вышло. */
export type ProbeAnswer = { text: string } | { error: string }

/**
 * Вызов инструмента коннектора без модели: IDE сама, тем же входом, что у разговоров. Чужой
 * проекту, не на чтение, выключенный - ошибка словами для модели.
 */
export type GoalProbe = (
  projectPath: string,
  server: string,
  tool: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<ProbeAnswer>

export type JudgeAnswer =
  { relevant: boolean; summary: string; costUsd: number } | { error: string; costUsd: number }

export type LookAnswer =
  | { changed: boolean; seen: string; summary: string; costUsd: number }
  | { error: string; costUsd: number }

/** Что поручение ждёт - слова дешёвой модели. */
export type GoalAbout = { goal: string; reason: string }

/** Дешёвая модель проверок (Haiku с низким усилием): судья перемены и короткий взгляд. */
export type GoalChecker = {
  judge: (
    input: GoalAbout & { expect: string; before: string; after: string },
    signal: AbortSignal,
  ) => Promise<JudgeAnswer>
  look: (
    input: GoalAbout & { projectPath: string; instructions: string; expect: string; seen: string },
    signal: AbortSignal,
  ) => Promise<LookAnswer>
}

/** Чем кончилась проверка сторожа: его новое состояние, деньги, строка истории и повод будить. */
export type WatchCheck = {
  watch: GoalWatch
  costUsd: number
  event: { kind: GoalEventKind; text: string } | null
  /** Будить рабочую модель с этими словами; null - спать дальше. */
  wake: { kind: 'changed' | 'watchFailed'; text: string } | null
}

export type WatchContext = GoalAbout & {
  projectPath: string
  probe: GoalProbe
  checker: GoalChecker
  now: () => number
  signal: AbortSignal
}

/** Пробелы схлопываются: перенос строки в ответе сервиса - не перемена. */
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()

export const digest = (text: string): string =>
  createHash('sha256').update(normalize(text)).digest('hex')

export const clip = (text: string, max = SEEN_MAX) =>
  text.length > max ? `${text.slice(0, max)}…` : text

/** Сторож словами для модели и истории: «gmail-work read_thread» или «the check "…"». */
export const watchLabel = (watch: GoalWatch): string =>
  watch.kind === 'tool'
    ? `${watch.server} ${watch.tool}`
    : `the check "${clip(watch.instructions, 80)}"`

/** Проверка не прошла: следующая - позже; провалов набралось - будить, пусть модель чинит. */
const failed = (watch: GoalWatch, error: string, now: number, costUsd: number): WatchCheck => {
  const failures = watch.failures + 1
  const wakes = failures >= WATCH_FAILURES_WAKE
  const next = { ...watch, failures, lastError: clip(error, 500), lastAt: now }

  return {
    watch: { ...next, nextAt: now + failureGap(next, now) },
    costUsd,
    event: wakes
      ? { kind: 'watchFailed', text: `${watchLabel(watch)}: ${clip(error, 300)}` }
      : null,
    wake: wakes ? { kind: 'watchFailed', text: clip(error, 300) } : null,
  }
}

const settled = (watch: GoalWatch, now: number): GoalWatch => ({
  ...watch,
  lastAt: now,
  failures: 0,
  lastError: '',
  nextAt: now + checkGap(watch, now),
})

/**
 * Сторож-инструмент: вызов без модели и отпечаток ответа. Тот же отпечаток - ни цента. Другой -
 * дешёвая модель решает, событие это или шум; первый ответ - точка отсчёта без суда.
 */
const checkTool = async (watch: GoalWatch, context: WatchContext): Promise<WatchCheck> => {
  const answer = await context.probe(
    context.projectPath,
    watch.server,
    watch.tool,
    watch.args,
    context.signal,
  )
  const now = context.now()

  if ('error' in answer) return failed(watch, answer.error, now, 0)

  const hash = digest(answer.text)
  const seen = clip(answer.text)

  if (!watch.hash) {
    return { watch: settled({ ...watch, hash, seen }, now), costUsd: 0, event: null, wake: null }
  }

  if (hash === watch.hash)
    return { watch: settled(watch, now), costUsd: 0, event: null, wake: null }

  const verdict = await context.checker.judge(
    {
      goal: context.goal,
      reason: context.reason,
      expect: watch.expect,
      before: watch.seen,
      after: seen,
    },
    context.signal,
  )
  const at = context.now()

  // Судья не ответил - отпечаток прежний: следующая проверка увидит ту же перемену и спросит снова.
  if ('error' in verdict) return failed(watch, verdict.error, at, verdict.costUsd)

  const next = { ...watch, hash, seen }

  if (verdict.relevant) {
    return {
      watch: settled({ ...next, changedAt: at }, at),
      costUsd: verdict.costUsd,
      event: { kind: 'changed', text: `${watchLabel(watch)}: ${verdict.summary}` },
      wake: { kind: 'changed', text: verdict.summary },
    }
  }

  return {
    watch: settled(next, at),
    costUsd: verdict.costUsd,
    event: { kind: 'noise', text: `${watchLabel(watch)}: ${verdict.summary}` },
    wake: null,
  }
}

/** Сторож-взгляд: дешёвая модель смотрит сама и помнит, что видела в прошлый раз. */
const checkLook = async (watch: GoalWatch, context: WatchContext): Promise<WatchCheck> => {
  const verdict = await context.checker.look(
    {
      goal: context.goal,
      reason: context.reason,
      projectPath: context.projectPath,
      instructions: watch.instructions,
      expect: watch.expect,
      seen: watch.seen,
    },
    context.signal,
  )
  const now = context.now()

  if ('error' in verdict) return failed(watch, verdict.error, now, verdict.costUsd)

  const next = { ...watch, seen: clip(verdict.seen, 1_200) }

  if (!verdict.changed) {
    return { watch: settled(next, now), costUsd: verdict.costUsd, event: null, wake: null }
  }

  return {
    watch: settled({ ...next, changedAt: now }, now),
    costUsd: verdict.costUsd,
    event: { kind: 'changed', text: `${watchLabel(watch)}: ${verdict.summary}` },
    wake: { kind: 'changed', text: verdict.summary },
  }
}

export const checkWatch = (watch: GoalWatch, context: WatchContext): Promise<WatchCheck> =>
  watch.kind === 'tool' ? checkTool(watch, context) : checkLook(watch, context)
