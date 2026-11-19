import { mkdir } from 'node:fs/promises'

import { effortLevelOf } from '@shared/conversation'

import type { AskOnce, AskOnceResult } from '../run-stream/ask-once'
import { jsonOf, schemaNote, toolsByServer } from '../run-stream/ask-once'
import { AcpProcess, isAuthError, unsupported } from '../../acp/client/acp-process'
import {
  ACP_PROMPT_TIMEOUT_MS,
  ACP_SESSION_TIMEOUT_MS,
  ACP_CLIENT_CAPABILITIES,
} from '../../acp/client/acp.constants'
import { applyChoice } from '../../acp/conversation/acp-options'
import { replyOf, holdPermission } from '../../acp/conversation/acp-requests'
import type {
  AcpPromptResult,
  AcpSessionSetup,
  AcpSessionUpdate,
  AcpPermissionRequest,
} from '../../acp/protocol/acp-types'
import type { CliMessage } from '../../claude/cli/cli-messages'
import { AcpRunCalls } from './acp-run-calls'
import type { AcpRunHost } from './acp-run-host'
import { failureOf } from './acp-run-host'
import { ownAnswer } from './acp-run-rules'
import { AcpTurnTranslator } from './acp-run-turns'

/** Сколько ждать, пока агент удалит сессию вопроса: дольше - пусть лежит, ответ уже есть. */
const DELETE_MS = 5_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Ответ из итога хода: текст и JSON из него или причина, почему ответа нет. */
const answerOf = (result: CliMessage): AskOnceResult => {
  const said = typeof result['result'] === 'string' ? result['result'] : ''

  if (result['is_error'] === true) return { error: said || 'The model did not answer.' }

  return said.trim() ? { text: said, output: jsonOf(said) } : { error: 'The model did not answer.' }
}

/**
 * Разовый вопрос агенту ACP (служебная работа IDE, ADR 0085): свой процесс, сессия в плане -
 * только чтение, ответ - последнее сообщение модели, JSON - из него (схема словами в
 * сообщении). Спросить человека некому: инструменты чтения коннекторов поимённо и веб, если
 * даны, - «да», выход из плана - «доработать», остальное - «нет», формы - отказ. Сессия
 * удаляется после ответа: в истории проекта её быть не должно.
 */
export const askAcpOnce = async (host: AcpRunHost, ask: AskOnce): Promise<AskOnceResult> => {
  const { agent } = host
  const cli = await host.cli()

  if (!cli) return { error: `${host.label} is not installed or not found.` }

  await mkdir(ask.cwd, { recursive: true })

  const mcp = ask.tools?.mcp ?? null
  // Коннекторы - проекта, о котором спрашивают, и только серверы с разрешёнными инструментами.
  const readable = toolsByServer(mcp?.tools ?? [])
  const connectors = mcp
    ? host.connectors(mcp.projectPath, [], [...readable.keys()])
    : { servers: [], launch: null }

  // Отменили, пока искался CLI: процесс не нужен вовсе.
  if (ask.signal?.aborted) {
    connectors.launch?.release()

    return { error: 'cancelled' }
  }

  const rules = { allowed: mcp?.tools ?? [], web: ask.tools?.web === true, readOnly: true }
  const calls = new AcpRunCalls(agent.lens(connectors.servers.map((one) => one.name)), agent.toolId)
  let sessionId = ''
  let finish: (result: AskOnceResult) => void = () => undefined
  const done = new Promise<AskOnceResult>((resolve) => (finish = resolve))
  const turns = new AcpTurnTranslator('ask', {
    emit: (message) => {
      if (message.type === 'result') finish(answerOf(message))
    },
    note: () => undefined,
  })
  // Спросить человека некому: решает правило прогона только чтения, а чего оно не решило - «нет».
  const answer = (method: string, params: unknown): Promise<unknown> => {
    if (method === 'elicitation/create') return Promise.resolve({ action: 'decline' })
    if (method !== 'session/request_permission' || !isRecord(params)) return unsupported(method)

    const request = params as AcpPermissionRequest
    const { toolCallId } = request.toolCall

    if (!calls.view(toolCallId)) calls.update(request.toolCall)

    const held = holdPermission(
      'ask',
      request,
      agent.toolId(toolCallId),
      calls.view(toolCallId),
      'readOnly',
      () => undefined,
    )

    return Promise.resolve(
      ownAnswer(held, rules, calls.kind(toolCallId)) ??
        replyOf(held, {
          kind: 'permission',
          decision: { behavior: 'deny', message: 'Nobody can approve this here.' },
        }),
    )
  }
  const launch = agent.launch('plan')
  const process = new AcpProcess(
    {
      binary: cli.binary,
      args: launch.args,
      cwd: ask.cwd,
      env: { ...cli.env, ...launch.env },
      capabilities: ACP_CLIENT_CAPABILITIES,
      version: host.version,
    },
    {
      onNotification: (method, params) => {
        if (method !== 'session/update' || !isRecord(params)) return
        if (!sessionId || params['sessionId'] !== sessionId) return

        const update = params['update'] as AcpSessionUpdate

        if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
          calls.update(update)
        }

        turns.update(update)
      },
      onRequest: answer,
      onExit: (_code, tail) =>
        finish({ error: tail.trim().split('\n').at(-1) || `${host.label} exited.` }),
    },
  )
  const timer = setTimeout(
    () => finish({ error: 'The model took too long to answer.' }),
    ask.timeoutMs,
  )
  const cancel = () => finish({ error: 'cancelled' })

  ask.signal?.addEventListener('abort', cancel, { once: true })

  // Вопрос идёт сам по себе, а ответ ждёт первого из исходов: ответа, срока, отмены, выхода.
  const start = async () => {
    const setup = (await process.request(
      'session/new',
      { cwd: ask.cwd, mcpServers: connectors.servers },
      ACP_SESSION_TIMEOUT_MS,
    )) as AcpSessionSetup

    sessionId = setup.sessionId ?? ''

    if (!sessionId) return finish({ error: `${host.label} did not start a session.` })

    await applyChoice(
      {
        request: (method, params) => process.request(method, params),
        sessionId,
        setup,
        noteSetup: (next) => void Object.assign(setup, next),
      },
      agent,
      { model: ask.model || null, effort: effortLevelOf(ask.effort), mode: agent.modeOf('plan') },
    )

    const text = [ask.system ?? '', ask.prompt, ask.schema ? schemaNote(ask.schema) : '']
      .filter(Boolean)
      .join('\n\n')

    turns.started()
    turns.ended(
      (await process.request(
        'session/prompt',
        { sessionId, prompt: [{ type: 'text', text }] },
        ACP_PROMPT_TIMEOUT_MS,
      )) as AcpPromptResult,
    )
  }

  start().catch((error: unknown) => {
    if (isAuthError(error)) host.signedOut()
    finish({ error: failureOf(host, error) })
  })

  try {
    return await done
  } finally {
    clearTimeout(timer)
    ask.signal?.removeEventListener('abort', cancel)
    await forget(host, process, sessionId, turns.isOpen)
    void process.stop()
    connectors.launch?.release()
  }
}

/**
 * Сессия вопроса - прочь: недоговоривший ход оборван (время вышло, отменили), разговор удалён,
 * где агент умеет; где нет - закрыт и забыт силами драйвера.
 */
const forget = async (
  host: AcpRunHost,
  process: AcpProcess,
  sessionId: string,
  running: boolean,
): Promise<void> => {
  if (!sessionId || !process.isAlive) return
  if (running) process.notify('session/cancel', { sessionId })

  const sessions = (await process.initialized).agentCapabilities?.sessionCapabilities
  const method = sessions?.delete ? 'session/delete' : sessions?.close ? 'session/close' : null

  if (method) await process.request(method, { sessionId }, DELETE_MS).catch(() => undefined)
  if (!sessions?.delete) await host.agent.forget?.(sessionId).catch(() => undefined)
}
