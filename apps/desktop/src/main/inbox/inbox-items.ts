import { randomUUID } from 'node:crypto'

import type { Question } from '@shared/claude'
import type { InboxItem, InboxAction, InboxActionKind } from '@shared/inbox'
import type { Task, TaskRun, TaskFailure } from '@shared/tasks'

import { ASK_TOOL, askTitle } from '../scenarios/engine/run-mail'
import type { CardAsk } from '../scenarios/engine/run-mail'

/**
 * Уведомления о прогонах заданий: вопрос, разрешение и план, на которых прогон стоит, его отчёт
 * и сбой. Чистые сборщики: что показать и какими кнопками, решается здесь, а не в сервисе.
 */

/** Отчёт в уведомлении - началом: целиком он в прогоне. */
const BODY_MAX = 6_000

export const PLAN_TOOL = 'ExitPlanMode'

export const action = (
  kind: InboxActionKind,
  options: { label?: string; value?: string; primary?: boolean; id?: string } = {},
): InboxAction => ({
  id: options.id ?? kind,
  kind,
  label: options.label ?? '',
  value: options.value ?? '',
  primary: options.primary ?? false,
})

/** Пустое уведомление: поля, которых у вида нет, - пустыми. */
export const blankItem = (
  patch: Partial<InboxItem> & Pick<InboxItem, 'kind' | 'title'>,
): InboxItem => {
  const now = Date.now()

  return {
    id: randomUUID(),
    tone: 'info',
    body: '',
    source: '',
    projectPath: '',
    origin: { kind: 'none' },
    actions: [],
    questions: [],
    tool: '',
    detail: '',
    reason: '',
    requestId: '',
    createdAt: now,
    deliverAt: now,
    arrivedAt: 0,
    readAt: 0,
    doneAt: 0,
    outcome: '',
    ...patch,
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown) => (typeof value === 'string' ? value : '')

/** Вопросы AskUserQuestion из входа вызова - тем видом, который рисует окно. */
export const questionsOf = (input: Record<string, unknown>): Question[] => {
  const list = Array.isArray(input['questions']) ? input['questions'].filter(isRecord) : []

  return list
    .map((one) => ({
      question: text(one['question']),
      header: text(one['header']),
      multiSelect: one['multiSelect'] === true,
      options: (Array.isArray(one['options']) ? one['options'].filter(isRecord) : []).map(
        (option) => ({ label: text(option['label']), description: text(option['description']) }),
      ),
    }))
    .filter((one) => one.question)
}

const SHOW_RUN = action('showRun')

/** Что именно просят: команда, файл, адрес - или вход вызова целиком (инструмент коннектора). */
const permissionDetail = (ask: CardAsk): string => {
  const said = askTitle(ask)

  if (said && said !== ask.description) return said.slice(0, 2000)

  const input = JSON.stringify(ask.input, null, 2)

  return input === '{}' ? '' : input.slice(0, 2000)
}

/** Вопрос прогона: варианты, план или разрешение - с кнопками ответа. */
export const askItem = (run: TaskRun, ask: CardAsk): InboxItem => {
  const base = {
    title: run.taskName,
    source: run.taskName,
    projectPath: run.projectPath,
    origin: { kind: 'task' as const, taskId: run.taskId, runId: run.id },
    requestId: ask.requestId,
    tone: 'attention' as const,
  }

  if (ask.toolName === ASK_TOOL) {
    return blankItem({
      ...base,
      kind: 'question',
      questions: questionsOf(ask.input),
      actions: [action('answer', { primary: true }), SHOW_RUN],
    })
  }

  if (ask.toolName === PLAN_TOOL) {
    return blankItem({
      ...base,
      kind: 'plan',
      body: text(ask.input['plan']).slice(0, BODY_MAX),
      actions: [action('approve', { primary: true }), action('revise'), SHOW_RUN],
    })
  }

  return blankItem({
    ...base,
    kind: 'permission',
    body: ask.description,
    tool: ask.toolName,
    detail: permissionDetail(ask),
    actions: [action('allow', { primary: true }), action('deny'), SHOW_RUN],
  })
}

/** Кнопки сбоя по причине: довериться папке, продолжить оборванное, запустить заново. */
const failureActions = (failure: TaskFailure | null): InboxAction[] => {
  if (failure === 'untrusted') return [action('trust', { primary: true }), SHOW_RUN]
  if (failure === 'ideClosed') return [action('resume', { primary: true }), SHOW_RUN]
  if (failure === 'crashed' || failure === 'turnError' || failure === 'tooLong') {
    return [action('resume', { primary: true }), action('runAgain'), SHOW_RUN]
  }

  return [action('runAgain', { primary: true }), SHOW_RUN]
}

/**
 * Итог прогона: сбой - всегда, отчёт - если задание просит и прогон не сказал сам своим
 * уведомлением. Остановленный человеком и пропущенный - без уведомления: о них человек знает.
 */
export const finishItem = (run: TaskRun, task: Task | undefined): InboxItem | null => {
  const base = {
    title: run.taskName,
    source: run.taskName,
    projectPath: run.projectPath,
    origin: { kind: 'task' as const, taskId: run.taskId, runId: run.id },
  }
  const interrupted = run.state === 'stopped' && run.failure === 'ideClosed'

  if (run.state === 'failed' || interrupted) {
    return blankItem({
      ...base,
      kind: 'failure',
      tone: 'danger',
      reason: run.failure ?? 'crashed',
      detail: run.detail,
      body: run.report.slice(0, BODY_MAX),
      actions: failureActions(run.failure),
    })
  }

  if (run.state !== 'done' || run.notified || task?.report === false) return null

  return blankItem({
    ...base,
    kind: 'report',
    tone: 'success',
    body: run.report.slice(0, BODY_MAX),
    actions: [SHOW_RUN, action('openChat')],
  })
}
