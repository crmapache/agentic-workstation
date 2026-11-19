import type { ModelInfo } from '@shared/conversation'

import { runModeOf } from '../run-stream/run-modes'
import { modelRefOf } from '../../opencode/connections/opencode-config'
import type { PermissionRule } from '../../opencode/conversation/opencode-modes'
import { agentFor, rulesFor } from '../../opencode/conversation/opencode-modes'
import type { OpenCodeServer } from '../../opencode/server/opencode-server'
import { OpenCodeReplyError } from '../../opencode/server/opencode-server'
import type { SessionSpec } from '../../scenarios/engine/scenario-session'

/** Ключ указаний сессии, в которых живёт бриф головы или задания. */
export const BRIEFING_KEY = 'agentic-workstation-briefing'

/** Правила режима прогона; веб разговору о коннекторе - поверх них, остальное как в режиме. */
export const runRules = (
  spec: SessionSpec,
  allowedActions: readonly string[],
): PermissionRule[] => {
  const rules = rulesFor(runModeOf(spec.permissionMode), allowedActions)

  // Разговор о коннекторе: веб поверх «только чтения», без субагентов (они ушли бы из правил).
  return spec.web
    ? [
        ...rules,
        ...['webfetch', 'websearch'].map((action) => ({
          action,
          resource: '*',
          effect: 'allow' as const,
        })),
        { action: 'subagent', resource: '*', effect: 'deny' as const },
      ]
    : rules
}

/** Модель и вариант усилия прогона: пустое - первая модель подключений, чужой уровень - нет. */
const modelRefFor = (spec: SessionSpec, models: readonly ModelInfo[]) => {
  const model = models.find((one) => one.value === spec.model) ?? models[0] ?? null
  const ref = model ? modelRefOf(model.value) : null
  const fits = model?.efforts?.some((level) => level === spec.effort) ?? false

  return ref && { ...ref, ...(fits && { variant: spec.effort }) }
}

/**
 * Сессия прогона у OpenCode: прошлая - с новыми правилами, агентом и моделью, иначе новая с id
 * от движка. Бриф головы - указаниями сессии; ответ - не встал ли он (старый OpenCode), тогда
 * он поедет первым сообщением новой сессии.
 */
export const openRunSession = async (
  server: OpenCodeServer,
  sessionId: string,
  run: {
    spec: SessionSpec
    cwd: string
    models: readonly ModelInfo[]
    permissions: PermissionRule[]
  },
): Promise<boolean> => {
  const { spec, permissions } = run
  const agent = agentFor(runModeOf(spec.permissionMode))
  const model = modelRefFor(spec, run.models)
  const base = `/api/session/${sessionId}`
  const known = await server
    .request('GET', base)
    .then(() => true)
    .catch((error: unknown) => {
      if (error instanceof OpenCodeReplyError && error.status === 404) return false
      throw error
    })

  if (known) {
    await server.request('PATCH', base, { body: { permissions } })
    await server.request('POST', `${base}/agent`, { body: { agent } })
    if (model) await server.request('POST', `${base}/model`, { body: { model } })
  } else {
    await server.request('POST', '/api/session', {
      body: {
        id: sessionId,
        location: { directory: run.cwd },
        agent,
        permissions,
        ...(model && { model }),
      },
    })
  }

  if (!spec.briefing) return false

  return server
    .request('PUT', `/api/experimental/session/${sessionId}/instructions/entries/${BRIEFING_KEY}`, {
      body: { value: spec.briefing },
    })
    .then(() => false)
    .catch(() => !known)
}
