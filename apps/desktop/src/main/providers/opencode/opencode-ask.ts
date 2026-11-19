import { mkdir } from 'node:fs/promises'

import type { AskOnce, AskOnceResult } from '../run-stream/ask-once'
import { jsonOf, schemaNote, toolsByServer } from '../run-stream/ask-once'
import { modelRefOf } from '../../opencode/connections/opencode-config'
import { agentFor, rulesFor } from '../../opencode/conversation/opencode-modes'
import { eventSessionOf } from '../../opencode/conversation/opencode-router'
import { dataOf, OpenCodeServer } from '../../opencode/server/opencode-server'
import type { OpenCodeRunHost } from './opencode-run-process'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Разовый вопрос открытой модели через OpenCode: свой процесс, сессия только на чтение (правки
 * запрещены, инструменты чтения коннекторов и веб - если даны, остальное - отказом без вопроса
 * человеку), схема ответа - в промпте, JSON - из текста. Сессия удаляется после ответа: в истории проекта её быть не должно.
 */
export const askOpenCodeOnce = async (
  host: Pick<OpenCodeRunHost, 'cli' | 'dirs' | 'launch' | 'models'>,
  ask: AskOnce,
): Promise<AskOnceResult> => {
  const cli = await host.cli()

  if (!cli) return { error: 'OpenCode is not installed or not found.' }

  await mkdir(ask.cwd, { recursive: true })

  const mcp = ask.tools?.mcp ?? null
  // Коннекторы - проекта, о котором спрашивают; процесс при этом - в своей пустой папке.
  const readable = toolsByServer(mcp?.tools ?? [])
  // В конфиг - только серверы с разрешёнными инструментами; нет инструментов - нет коннекторов.
  const launched = await host.launch(
    mcp?.projectPath ?? ask.cwd,
    ask.cwd,
    ask.model,
    [],
    [...readable.keys()],
  )

  // Отменили, пока поднимался конфиг: процесс не нужен вовсе.
  if (ask.signal?.aborted) {
    launched.connectors?.release()
    launched.release()

    return { error: 'cancelled' }
  }

  let sessionId = ''
  let said = ''
  let finish: (result: AskOnceResult) => void = () => undefined
  const done = new Promise<AskOnceResult>((resolve) => (finish = resolve))
  const server: OpenCodeServer = new OpenCodeServer(
    {
      binary: cli.binary,
      cwd: ask.cwd,
      env: { ...cli.env, ...launched.env },
      dirs: host.dirs(),
      config: launched.config,
    },
    {
      onEvent: ({ type, data }) => {
        if (!sessionId || eventSessionOf(data) !== sessionId) return

        // Спросить человека некому: всё, что не разрешено правилами, - отказ.
        if (type === 'permission.asked') {
          void server
            .request('POST', `/api/session/${sessionId}/permission/${String(data['id'])}/reply`, {
              body: { decision: 'reject' },
            })
            .catch(() => undefined)
        } else if (type === 'session.text.ended' && typeof data['text'] === 'string') {
          said = data['text'] || said
        } else if (type === 'session.execution.succeeded') {
          finish(
            said ? { text: said, output: jsonOf(said) } : { error: 'The model did not answer.' },
          )
        } else if (type === 'session.execution.failed') {
          const error = isRecord(data['error']) ? data['error']['message'] : null

          finish({ error: typeof error === 'string' ? error : 'The model did not answer.' })
        }
      },
      onExit: (_code, tail) =>
        finish({ error: tail.trim().split('\n').at(-1) || 'OpenCode exited.' }),
    },
  )
  const timer = setTimeout(
    () => finish({ error: 'The model took too long to answer.' }),
    ask.timeoutMs,
  )
  const cancel = () => finish({ error: 'cancelled' })

  ask.signal?.addEventListener('abort', cancel, { once: true })

  try {
    const models = host.models()
    const model = models.find((one) => one.value === ask.model) ?? models[0] ?? null
    const ref = model ? modelRefOf(model.value) : null
    const fits = model?.efforts?.some((level) => level === ask.effort) ?? false
    const created = dataOf(
      await server.request('POST', '/api/session', {
        body: {
          location: { directory: ask.cwd },
          agent: agentFor('readOnly'),
          permissions: [
            ...rulesFor('readOnly'),
            // Инструменты чтения коннекторов - поимённо (`<сервер>_<инструмент>`), веб - если дан.
            ...[...readable].flatMap(([server, tools]) =>
              tools.map((tool) => ({
                action: `${server}_${tool}`,
                resource: '*',
                effect: 'allow',
              })),
            ),
            ...(ask.tools?.web
              ? ['webfetch', 'websearch'].map((action) => ({
                  action,
                  resource: '*',
                  effect: 'allow',
                }))
              : []),
            // Последнее совпавшее правило главнее: ни субагента (он ушёл бы из правил), ни вопроса
            // человеку (ответить некому) - даже если режим их разрешает.
            ...['subagent', 'question'].map((action) => ({
              action,
              resource: '*',
              effect: 'deny',
            })),
          ],
          ...(ref && { model: { ...ref, ...(fits && { variant: ask.effort }) } }),
        },
      }),
    )

    sessionId = isRecord(created) && typeof created['id'] === 'string' ? created['id'] : ''

    if (!sessionId) return { error: 'OpenCode did not start a session.' }

    // Команды модели (автор читает проект) - в окружении человека, а не процесса OpenCode.
    await server.request('PUT', `/api/session/${sessionId}/environment`, {
      body: { variables: cli.env },
    })

    await server.request('POST', `/api/session/${sessionId}/prompt`, {
      body: {
        text: [ask.system ?? '', ask.prompt, ask.schema ? schemaNote(ask.schema) : '']
          .filter(Boolean)
          .join('\n\n'),
        delivery: 'queue',
      },
    })

    return await done
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
    ask.signal?.removeEventListener('abort', cancel)
    if (sessionId)
      await server.request('DELETE', `/api/session/${sessionId}`).catch(() => undefined)
    void server.stop()
    launched.connectors?.release()
    launched.release()
  }
}
