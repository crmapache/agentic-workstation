import type { PendingRequest, RequestResponse } from '@shared/conversation'

import type { EngineAnswer } from './claude-stream'

/** Обёртка оболочки вокруг команды: `/bin/zsh -lc 'pnpm test'`, `bash -c "ls"`. */
const SHELL_WRAP = /^(?:\S*\/)?(?:zsh|bash|sh)\s+-l?c\s+(['"]?)([\s\S]*)\1$/

/**
 * Команда без обёртки оболочки: Codex спрашивает о команде вместе с ней, а забор головы судит
 * по первому слову - с обёрткой он видел бы `zsh` и отказывал всему, что Claude бы запустил.
 */
export const unwrapShell = (command: string): string => {
  const [, , inner] = SHELL_WRAP.exec(command.trim()) ?? []

  return inner === undefined ? command : inner
}

/** Вопрос провайдера словами Claude Code: инструмент, вход и короткое описание. */
export type EngineQuestion = {
  toolName: string
  input: Record<string, unknown>
  description: string
}

/**
 * Вопрос провайдера (общий вид панели, PendingRequest) - вопросом `can_use_tool`, каким его
 * задал бы Claude Code. Голова судит вопрос карточки по имени инструмента и его входу
 * (scenarios/engine/head-fence.ts, run-mail.ts): команда - `Bash` с `command`, правка -
 * `Edit`/`Write` с `file_path`, выбор - `AskUserQuestion` с вопросами и вариантами.
 */
export const engineQuestionOf = (pending: PendingRequest): EngineQuestion => {
  if (pending.kind === 'question') {
    return {
      toolName: 'AskUserQuestion',
      input: {
        questions: pending.questions.map((question) => ({
          question: question.question,
          header: question.header,
          options: question.options,
          multiSelect: question.multiSelect,
        })),
      },
      description: '',
    }
  }

  // План - как его показывает Claude Code: голова судит одобрение по тексту плана.
  if (pending.kind !== 'permission') {
    return { toolName: 'ExitPlanMode', input: { plan: pending.plan }, description: '' }
  }

  const { action, description } = pending

  switch (action.kind) {
    case 'command':
      return {
        toolName: 'Bash',
        input: { command: unwrapShell(action.command), description: action.description },
        description,
      }
    case 'edit':
      return { toolName: 'Edit', input: { file_path: action.path }, description }
    case 'write':
      return { toolName: 'Write', input: { file_path: action.path }, description }
    case 'read':
      return { toolName: 'Read', input: { file_path: action.path }, description }
    case 'web':
      return { toolName: 'WebFetch', input: { url: action.target }, description }
    case 'mcp':
      return {
        toolName: `mcp__${action.server}__${action.tool}`,
        input: pending.input,
        description,
      }
    default:
      return { toolName: pending.toolName, input: pending.input, description }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Ответ движка - ответом панели провайдеру: на выбор - ответы по тексту вопроса (движок кладёт
 * их в `updatedInput.answers`, как AskUserQuestion), отказ на выбор - без ответов; на
 * разрешение - «да» или «нет» с причиной.
 */
export const responseOf = (pending: PendingRequest, answer: EngineAnswer): RequestResponse => {
  if (pending.kind === 'question') {
    const given = answer.allow && isRecord(answer.input['answers']) ? answer.input['answers'] : {}

    return {
      kind: 'question',
      answers: Object.fromEntries(
        Object.entries(given).flatMap(([question, value]) =>
          typeof value === 'string' ? [[question, value]] : [],
        ),
      ),
    }
  }

  if (pending.kind === 'plan') {
    return { kind: 'plan', approved: answer.allow, acceptEdits: false, feedback: '' }
  }

  return {
    kind: 'permission',
    decision: answer.allow
      ? { behavior: 'allow' }
      : { behavior: 'deny', message: answer.message.trim() || 'Refused.' },
  }
}
